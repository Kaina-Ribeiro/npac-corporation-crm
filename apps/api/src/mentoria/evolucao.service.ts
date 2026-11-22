import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { mentoriaConquistas, mentoriaEvolucao, withUser, type Db, type Tx } from '@npac/db';
import {
  CAMPOS_EVOLUCAO,
  type AuthUser,
  type CampoEvolucao,
  type ConquistaCriar,
  type ConquistaDTO,
  type EvolucaoDTO,
  type EvolucaoPut,
} from '@npac/shared';
import { and, eq, sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

/** Campo da tela → coluna (o AAD usa o nome da coluna). */
export const COLUNA_EVOLUCAO: Record<CampoEvolucao, string> = {
  reservaAntes: 'reserva_antes',
  reservaHoje: 'reserva_hoje',
  renda: 'renda',
  saude: 'saude',
  investimentos: 'investimentos',
  areaAtuacao: 'area_atuacao',
  inicialNotas: 'inicial_notas',
  atualNotas: 'atual_notas',
};

type LinhaEvolucao = Record<CampoEvolucao, string | null> & {
  version: number;
  atual_em: Date | string | null;
  atual_por: string | null;
  foto_inicial: string | null;
  foto_inicial_em: Date | string | null;
  foto_atual: string | null;
  foto_atual_em: Date | string | null;
};

type LinhaConquista = {
  id: string;
  data: string | null;
  descricao: string | null;
  midia_id: string | null;
  midia_tipo: string | null;
  criado_em: Date | string;
};

const iso = (v: Date | string) => new Date(v).toISOString();

/**
 * Aba Evolução (NPAC-57, spec 2026-11-21, §6). Leitura: Admin, Acompanhamento (com "só a carteira") e Operação, pela
 * `mentoria_ve_evolucao`; a Especialista recebe 404. Escrita: área EVOLUCAO (Admin, Acompanhamento). Textos cifrados
 * com AAD da coluna; o histórico leva só os nomes dos campos. Dor, sonho, meta, valores e pilares vêm das tabelas de
 * sempre, com as regras de sempre (RLS).
 */
@Injectable()
export class EvolucaoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
  ) {}

  /** 404 se a inscrição não existe ou quem está logado não vê a evolução dela. */
  private async exigirLeitura(tx: Tx, inscricaoId: string): Promise<{ edita: boolean }> {
    const [r] = await tx.execute<{ ve: boolean; edita: boolean }>(sql`
      select mentoria_ve_evolucao(${inscricaoId}::uuid) as ve,
        mentoria_edita('EVOLUCAO', ${inscricaoId}::uuid) as edita`);
    if (!r?.ve) throw new NotFoundException();
    return { edita: r.edita === true };
  }

  private texto(inscricaoId: string, campo: CampoEvolucao, blob: string | null) {
    return this.crypto.decifrarOpcional(
      blob,
      aad('mentoria_evolucao', COLUNA_EVOLUCAO[campo], inscricaoId),
    );
  }

  private conquistaDto(c: LinhaConquista): ConquistaDTO {
    return {
      id: c.id,
      data: c.data,
      descricao: this.crypto.decifrarOpcional(
        c.descricao,
        aad('mentoria_conquistas', 'descricao', c.id),
      ),
      midia:
        c.midia_id && (c.midia_tipo === 'FOTO' || c.midia_tipo === 'VIDEO')
          ? { id: c.midia_id, tipo: c.midia_tipo }
          : null,
      criadoEm: iso(c.criado_em),
    };
  }

  private conquistas(tx: Tx, filtro: ReturnType<typeof sql>): Promise<LinhaConquista[]> {
    return tx.execute<LinhaConquista>(sql`
      select c.id, to_char(c.data, 'YYYY-MM-DD') as data, c.descricao, m.id as midia_id,
        m.tipo as midia_tipo, c.criado_em
      from mentoria_conquistas c left join mentoria_midia m on m.id = c.midia_id
      where ${filtro}
      order by c.data asc nulls last, c.criado_em, c.id`);
  }

  ler(u: AuthUser, inscricaoId: string): Promise<EvolucaoDTO> {
    return withUser(this.db, u.id, async (tx) => {
      const { edita } = await this.exigirLeitura(tx, inscricaoId);
      const [e] = await tx.execute<LinhaEvolucao>(sql`
        select e.version, e.reserva_antes as "reservaAntes", e.reserva_hoje as "reservaHoje", e.renda,
          e.saude, e.investimentos, e.area_atuacao as "areaAtuacao", e.inicial_notas as "inicialNotas",
          e.atual_notas as "atualNotas", e.atual_atualizado_em as atual_em, u.name as atual_por,
          fi.id as foto_inicial, fi.criado_em as foto_inicial_em,
          fa.id as foto_atual, fa.criado_em as foto_atual_em
        from mentoria_evolucao e
        left join "user" u on u.id = e.atual_atualizado_por
        left join mentoria_midia fi on fi.id = e.foto_inicial_midia_id
        left join mentoria_midia fa on fa.id = e.foto_atual_midia_id
        where e.inscricao_id = ${inscricaoId}::uuid`);
      const [m] = await tx.execute<{
        dor: string | null;
        sonho: string | null;
        meta: string | null;
        recebe: number | null;
        custo: number | null;
        dividas: number | null;
        guardado: number | null;
        travado_em: Date | string | null;
      }>(sql`
        select dor, sonho, meta, recebe_centavos::float8 as recebe, custo_centavos::float8 as custo,
          dividas_centavos::float8 as dividas, guardado_centavos::float8 as guardado, travado_em
        from mentoria_momento_inicial where inscricao_id = ${inscricaoId}::uuid`);
      const momento = (campo: 'dor' | 'sonho' | 'meta') =>
        this.crypto.decifrarOpcional(
          m?.[campo],
          aad('mentoria_momento_inicial', campo, inscricaoId),
        );
      const pilares = await tx.execute<{
        pessoa_id: string;
        nome: string;
        fe: number | null;
        saude: number | null;
        dinheiro: number | null;
        relacionamentos: number | null;
      }>(sql`
        select p.id as pessoa_id, p.nome, a.nota_fe as fe, a.nota_saude as saude,
          a.nota_dinheiro as dinheiro, a.nota_relacionamentos as relacionamentos
        from mentoria_pessoas p
        left join mentoria_avaliacoes a on a.pessoa_id = p.id and a.tipo = 'PILARES'
          and a.momento = 'INICIAL'
        where p.inscricao_id = ${inscricaoId}::uuid
        order by p.ordem`);
      const conquistas = await this.conquistas(tx, sql`c.inscricao_id = ${inscricaoId}::uuid`);

      const campos = Object.fromEntries(
        CAMPOS_EVOLUCAO.map((c) => [c, e ? this.texto(inscricaoId, c, e[c]) : null]),
      ) as Record<CampoEvolucao, string | null>;
      return {
        inscricaoId,
        version: e?.version ?? 0,
        campos,
        atualAtualizadoEm: e?.atual_em ? iso(e.atual_em) : null,
        atualAtualizadoPor: e?.atual_por ?? null,
        fotoInicial:
          e?.foto_inicial && e.foto_inicial_em
            ? { id: e.foto_inicial, em: iso(e.foto_inicial_em) }
            : null,
        fotoAtual:
          e?.foto_atual && e.foto_atual_em ? { id: e.foto_atual, em: iso(e.foto_atual_em) } : null,
        daAba: { dor: momento('dor'), sonho: momento('sonho'), meta: momento('meta') },
        partida: {
          recebeCentavos: m?.recebe ?? null,
          custoCentavos: m?.custo ?? null,
          dividasCentavos: m?.dividas ?? null,
          guardadoCentavos: m?.guardado ?? null,
          concluidoEm: m?.travado_em ? iso(m.travado_em) : null,
        },
        pilares: pilares.map((p) => ({
          pessoaId: p.pessoa_id,
          nome: p.nome,
          fe: p.fe,
          saude: p.saude,
          dinheiro: p.dinheiro,
          relacionamentos: p.relacionamentos,
        })),
        conquistas: conquistas.map((c) => this.conquistaDto(c)),
        podeEditar: edita,
      };
    });
  }

  /** `version: 0` cria a linha (como o Momento inicial); depois, UPDATE com a version da resposta anterior. */
  salvar(u: AuthUser, inscricaoId: string, b: EvolucaoPut): Promise<{ version: number }> {
    return withUser(this.db, u.id, async (tx) => {
      await this.exigirLeitura(tx, inscricaoId);
      await exigirEdicao(tx, 'EVOLUCAO', inscricaoId);
      const enviados = CAMPOS_EVOLUCAO.filter((c) => b[c] !== undefined);
      const campos = Object.fromEntries(
        enviados.map((c) => [
          c,
          this.crypto.cifrarOpcional(
            b[c],
            aad('mentoria_evolucao', COLUNA_EVOLUCAO[c], inscricaoId),
          ),
        ]),
      ) as Partial<Record<CampoEvolucao, string | null>>;
      const [r] =
        b.version === 0
          ? await tx
              .insert(mentoriaEvolucao)
              .values({ ...campos, inscricaoId })
              .onConflictDoNothing()
              .returning({ version: mentoriaEvolucao.version })
          : await tx
              .update(mentoriaEvolucao)
              .set({
                ...campos,
                version: sql`${mentoriaEvolucao.version} + 1`,
                atualizadoEm: sql`now()`,
              })
              .where(
                and(
                  eq(mentoriaEvolucao.inscricaoId, inscricaoId),
                  eq(mentoriaEvolucao.version, b.version),
                ),
              )
              .returning({ version: mentoriaEvolucao.version });
      if (!r) throw conflitoDeVersao();
      await registrarHistorico(tx, inscricaoId, 'evolucao.editada', enviados);
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  criarConquista(u: AuthUser, inscricaoId: string, b: ConquistaCriar): Promise<ConquistaDTO> {
    const id = randomUUID();
    return withUser(this.db, u.id, async (tx) => {
      await this.exigirLeitura(tx, inscricaoId);
      await exigirEdicao(tx, 'EVOLUCAO', inscricaoId);
      await tx.insert(mentoriaConquistas).values({
        id,
        inscricaoId,
        data: b.data ?? null,
        descricao: this.crypto.cifrarOpcional(
          b.descricao,
          aad('mentoria_conquistas', 'descricao', id),
        ),
        criadoPor: u.id,
      });
      await registrarHistorico(tx, inscricaoId, 'conquista.adicionada', [
        ...(b.data != null ? ['data'] : []),
        ...(b.descricao != null ? ['descricao'] : []),
      ]);
      const [c] = await this.conquistas(tx, sql`c.id = ${id}::uuid`);
      return this.conquistaDto(c!);
    }).catch((e) => erroDoBanco(e));
  }

  excluirConquista(u: AuthUser, conquistaId: string): Promise<void> {
    return withUser(this.db, u.id, async (tx) => {
      const [c] = await tx
        .select({ inscricaoId: mentoriaConquistas.inscricaoId })
        .from(mentoriaConquistas)
        .where(eq(mentoriaConquistas.id, conquistaId));
      if (!c) throw new NotFoundException();
      await tx.execute(sql`select mentoria_conquista_excluir(${conquistaId}::uuid)`);
      await registrarHistorico(tx, c.inscricaoId, 'conquista.removida', []);
    }).catch((e) => erroDoBanco(e));
  }
}
