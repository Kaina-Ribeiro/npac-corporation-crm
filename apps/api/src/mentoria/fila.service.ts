import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { withUser, type Db, type Tx } from '@npac/db';
import {
  FILA_FEITO_MANUAL,
  escopoPadrao,
  itemVisivel,
  type AuthUser,
  type Etapa,
  type FilaDTO,
  type FilaEu,
  type FilaFiltro,
  type FilaItemBase,
  type FilaItemDTO,
  type FilaTipo,
  type Mentoria,
  type Perfil,
  type ReuniaoStatus,
  type ReuniaoTipo,
  type TipoInscricao,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';
import { MENTORIA_CLOCK, type Clock } from './relogio.js';

type LinhaFila = {
  chave: string;
  tipo: FilaTipo;
  inscricao_id: string | null;
  referencia_id: string | null;
  responsavel_perfil: FilaItemBase['responsavelPerfil'];
  responsavel_id: string | null;
  vence_em: Date | string;
  atrasado: boolean;
};

type LinhaMentorado = {
  id: string;
  tipo: TipoInscricao;
  mentoria: Mentoria;
  link_grupo: string | null;
  pessoas: { id: string; nome: string; apelido: string | null; whatsapp: string | null }[];
};

const iso = (d: Date | string) => new Date(d).toISOString();

/**
 * Fila do dia (§5, D18). O banco calcula os itens na leitura (`mentoria_fila`, RLS do invocador);
 * aqui entra quem vê cada um (`itemVisivel`) e o que a tela precisa: nome, WhatsApp, reunião, ação.
 */
@Injectable()
export class FilaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    @Inject(MENTORIA_CLOCK) private readonly clock: Clock,
  ) {}

  agora(): Date {
    return new Date(this.clock.now());
  }

  private async eu(tx: Tx, id: string): Promise<FilaEu> {
    const [r] = await tx.execute<{ perfil: Perfil | null; admin: boolean }>(
      sql`select mentoria_perfil() as perfil, mentoria_admin() as admin`,
    );
    return { id, perfil: r?.perfil ?? null, admin: r?.admin === true };
  }

  /** Os itens do banco, já com o escopo de quem pede. */
  private async itens(tx: Tx, eu: FilaEu, agora: Date, escopo: FilaDTO['escopo']) {
    const linhas = await tx.execute<LinhaFila>(
      sql`select * from mentoria_fila(${agora.toISOString()}::timestamptz)`,
    );
    return [...linhas]
      .map((l): FilaItemBase => ({
        chave: l.chave,
        tipo: l.tipo,
        inscricaoId: l.inscricao_id,
        referenciaId: l.referencia_id,
        responsavelPerfil: l.responsavel_perfil,
        responsavelId: l.responsavel_id,
        venceEm: iso(l.vence_em),
        atrasado: l.atrasado,
      }))
      .filter((i) => itemVisivel(i, eu, escopo));
  }

  listar(u: AuthUser, filtro: FilaFiltro): Promise<FilaDTO> {
    const agora = this.agora();
    return withUser(this.db, u.id, async (tx) => {
      const eu = await this.eu(tx, u.id);
      const escopo = filtro.escopo ?? escopoPadrao(eu);
      const base = (await this.itens(tx, eu, agora, escopo)).filter(
        (i) => !filtro.tipos || filtro.tipos.includes(i.tipo),
      );
      return { agora: agora.toISOString(), escopo, itens: await this.detalhar(tx, base) };
    });
  }

  /** Mentorado, reunião, ação e etapa de cada item, em uma consulta por tipo de alvo. */
  private async detalhar(tx: Tx, base: FilaItemBase[]): Promise<FilaItemDTO[]> {
    const ids = (f: (i: FilaItemBase) => string | null, tipos?: FilaTipo[]) => [
      ...new Set(
        base
          .filter((i) => !tipos || tipos.includes(i.tipo))
          .map(f)
          .filter((x): x is string => !!x),
      ),
    ];
    const inscricoes = ids((i) => i.inscricaoId);
    const reunioes = ids((i) => i.referenciaId, ['LEMBRETE_IDR', 'LINK_IDR', 'REUNIAO_HOJE']);
    const acoes = ids((i) => i.referenciaId, ['ACAO']);
    const etapas = ids(
      (i) => i.referenciaId,
      ['BOAS_VINDAS', 'PASSO_DEVIDO', 'PARADO', 'ENVIAR_CAIXA', 'CAIXA_ATRASADA', 'AGENDAR_IDR'],
    );

    const mentorados = new Map<string, FilaItemDTO['mentorado']>();
    if (inscricoes.length) {
      const linhas = await tx.execute<LinhaMentorado>(sql`
        select i.id, i.tipo, i.mentoria, i.link_grupo,
          (select json_agg(json_build_object('id', p.id, 'nome', p.nome, 'apelido', p.apelido,
             'whatsapp', p.whatsapp) order by p.ordem)
           from mentoria_pessoas p where p.inscricao_id = i.id) as pessoas
        from mentoria_inscricoes i where i.id = any(${sql.param(inscricoes)}::uuid[])`);
      for (const l of linhas) {
        const pessoas = (l.pessoas ?? []).map((p) => ({
          nome: p.nome,
          apelido: p.apelido,
          whatsapp: this.crypto.decifrarOpcional(
            p.whatsapp,
            aad('mentoria_pessoas', 'whatsapp', p.id),
          ),
        }));
        mentorados.set(l.id, {
          nome: pessoas.map((p) => p.nome).join(' e '),
          tipo: l.tipo,
          mentoria: l.mentoria,
          linkGrupo: l.link_grupo,
          pessoas,
        });
      }
    }

    const porReuniao = new Map<string, FilaItemDTO['reuniao']>();
    if (reunioes.length) {
      const linhas = await tx.execute<{
        id: string;
        tipo: ReuniaoTipo;
        inicio: Date | string;
        status: ReuniaoStatus;
        version: number;
        link: string | null;
        condutor: string | null;
      }>(sql`
        select r.id, r.tipo, r.inicio, r.status, r.version, r.link,
          coalesce(u.name, (select string_agg(p.nome, ' e ' order by p.ordem)
            from mentoria_pessoas p where p.inscricao_id = r.condutor_inscricao_id)) as condutor
        from mentoria_reunioes r left join "user" u on u.id = r.conduzida_por
        where r.id = any(${sql.param(reunioes)}::uuid[])`);
      for (const l of linhas)
        porReuniao.set(l.id, {
          tipo: l.tipo,
          inicio: iso(l.inicio),
          status: l.status,
          version: l.version,
          link: l.link,
          condutor: l.condutor,
        });
    }

    const porAcao = new Map<string, FilaItemDTO['acao']>();
    if (acoes.length) {
      const linhas = await tx.execute<{
        id: string;
        mes: number;
        foco: string;
        acao: string;
        version: number;
      }>(sql`select id, mes, foco, acao, version from mentoria_acoes
        where id = any(${sql.param(acoes)}::uuid[])`);
      for (const l of linhas)
        porAcao.set(l.id, { mes: l.mes, foco: l.foco, acao: l.acao, version: l.version });
    }

    const porEtapa = new Map<string, Etapa>();
    if (etapas.length) {
      const linhas = await tx.execute<{ id: string; etapa: Etapa }>(
        sql`select id, etapa from mentoria_onboarding_etapas
          where id = any(${sql.param(etapas)}::uuid[])`,
      );
      for (const l of linhas) porEtapa.set(l.id, l.etapa);
    }

    return base.map((i) => ({
      ...i,
      mentorado: i.inscricaoId ? (mentorados.get(i.inscricaoId) ?? null) : null,
      etapa: i.referenciaId ? (porEtapa.get(i.referenciaId) ?? null) : null,
      reuniao: i.referenciaId ? (porReuniao.get(i.referenciaId) ?? null) : null,
      acao: i.referenciaId ? (porAcao.get(i.referenciaId) ?? null) : null,
    }));
  }

  /**
   * Conclui um item sem estado próprio. Só vale para um item que está na fila de quem pede agora
   * (equipe): chave inventada, vencida ou de outro perfil dá 404.
   */
  feito(u: AuthUser, chave: string): Promise<void> {
    const agora = this.agora();
    return withUser(this.db, u.id, async (tx) => {
      const eu = await this.eu(tx, u.id);
      const item = (await this.itens(tx, eu, agora, 'EQUIPE')).find((i) => i.chave === chave);
      if (!item || !FILA_FEITO_MANUAL.includes(item.tipo)) throw new NotFoundException();
      await tx.execute(sql`insert into mentoria_fila_feitos (chave, feito_por)
        values (${chave}, app_user_id()) on conflict do nothing`);
    }).catch((e) => erroDoBanco(e));
  }

  /** "Enviar o 1º PME" sai quando a equipe marca o envio (§5, F3). */
  pme1(
    u: AuthUser,
    inscricaoId: string,
    enviado: boolean,
  ): Promise<{ pme1EnviadoEm: string | null }> {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'INSCRICAO', inscricaoId);
      const [r] = await tx.execute<{ em: Date | string | null }>(sql`
        update mentoria_inscricoes set pme1_enviado_em = ${enviado ? sql`now()` : sql`null`},
          atualizado_em = now()
        where id = ${inscricaoId}::uuid returning pme1_enviado_em as em`);
      if (!r) throw new NotFoundException();
      await registrarHistorico(tx, inscricaoId, 'inscricao.pme1', ['pme1EnviadoEm']);
      return { pme1EnviadoEm: r.em ? iso(r.em) : null };
    }).catch((e) => erroDoBanco(e));
  }
}
