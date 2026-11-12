import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { mentoriaMetas, withUser, type Db, type Tx } from '@npac/db';
import type { AuthUser, MetaCriar, MetaDTO, MetaPatch } from '@npac/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

type LinhaMeta = Omit<MetaDTO, 'criadoEm'> & { criadoEm: Date | string };

/** Campos da meta que a tela edita, com o nome da coluna (o histórico grava só os nomes). */
const CAMPOS = [
  'pilar',
  'pessoaId',
  'valorAlvo',
  'valorAtual',
  'unidade',
  'prazo',
  'status',
] as const;

/** Reunião que recebe tarefa ou meta: não remarcada nem com falta (§4). */
export const ESTADOS_SEM_REGISTRO = ['REMARCADA', 'FALTOU'];

/**
 * Metas (Fase 2, Parte 2, S3). Leitura: Admin, Acompanhamento e Operação (a Especialista não vê);
 * escrita: área META (Admin, Acompanhamento). A descrição é cifrada; o % do ciclo é do banco.
 */
@Injectable()
export class MetasService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
  ) {}

  /** Metas pelo filtro, mais recentes primeiro (RLS: vazio para quem não vê metas). */
  async consultar(tx: Tx, filtro: SQL): Promise<MetaDTO[]> {
    const linhas = await tx.execute<LinhaMeta>(sql`
      select m.id, m.version, m.inscricao_id as "inscricaoId", m.ciclo_id as "cicloId",
        c.numero as "cicloNumero", m.reuniao_id as "reuniaoId", m.pessoa_id as "pessoaId", m.pilar,
        m.descricao, m.valor_alvo::float8 as "valorAlvo", m.valor_atual::float8 as "valorAtual",
        m.unidade, to_char(m.prazo, 'YYYY-MM-DD') as prazo, m.status, m.criado_em as "criadoEm",
        mentoria_edita('META', m.inscricao_id) as "podeEditar"
      from mentoria_metas m left join mentoria_ciclos c on c.id = m.ciclo_id
      where ${filtro}
      order by m.criado_em desc, m.id
      limit 500`);
    return linhas.map((m) => ({
      ...m,
      descricao: this.crypto.decifrarOpcional(
        m.descricao,
        aad('mentoria_metas', 'descricao', m.id),
      ),
      criadoEm: new Date(m.criadoEm).toISOString(),
    }));
  }

  daInscricao(tx: Tx, inscricaoId: string): Promise<MetaDTO[]> {
    return this.consultar(tx, sql`m.inscricao_id = ${inscricaoId}::uuid`);
  }

  /** Reunião da mesma inscrição, que ainda recebe registro. */
  private async validarReuniao(tx: Tx, inscricaoId: string, reuniaoId: string) {
    const [r] = await tx.execute<{ status: string }>(sql`
      select status from mentoria_reunioes
      where id = ${reuniaoId}::uuid and inscricao_id = ${inscricaoId}::uuid`);
    if (!r) throw new BadRequestException('Reunião não encontrada');
    if (ESTADOS_SEM_REGISTRO.includes(r.status))
      throw new BadRequestException('Reunião remarcada ou com falta não recebe metas nem tarefas');
  }

  private async validarPessoa(tx: Tx, inscricaoId: string, pessoaId: string) {
    const [p] = await tx.execute<{ id: string }>(sql`
      select id from mentoria_pessoas
      where id = ${pessoaId}::uuid and inscricao_id = ${inscricaoId}::uuid`);
    if (!p) throw new BadRequestException('Pessoa não encontrada');
  }

  criar(u: AuthUser, inscricaoId: string, b: MetaCriar): Promise<MetaDTO> {
    const id = randomUUID();
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'META', inscricaoId);
      if (b.reuniaoId) await this.validarReuniao(tx, inscricaoId, b.reuniaoId);
      if (b.pessoaId) await this.validarPessoa(tx, inscricaoId, b.pessoaId);
      await tx.insert(mentoriaMetas).values({
        id,
        inscricaoId,
        cicloId: sql`(select c.id from mentoria_ciclos c where c.inscricao_id = ${inscricaoId}::uuid
          and c.concluido_em is null and c.nao_concluido_em is null)`,
        reuniaoId: b.reuniaoId ?? null,
        pessoaId: b.pessoaId ?? null,
        pilar: b.pilar ?? null,
        descricao: this.crypto.cifrarTexto(b.descricao, aad('mentoria_metas', 'descricao', id)),
        valorAlvo: b.valorAlvo == null ? null : String(b.valorAlvo),
        valorAtual: b.valorAtual == null ? null : String(b.valorAtual),
        unidade: b.unidade ?? null,
        prazo: b.prazo ?? null,
      });
      await registrarHistorico(tx, inscricaoId, 'meta.criada', [
        'descricao',
        ...CAMPOS.filter((k) => k !== 'status' && b[k] != null),
      ]);
      const [m] = await this.consultar(tx, sql`m.id = ${id}::uuid`);
      return m!;
    }).catch((e) => erroDoBanco(e));
  }

  abrir(u: AuthUser, id: string): Promise<MetaDTO> {
    return withUser(this.db, u.id, async (tx) => {
      const [m] = await this.consultar(tx, sql`m.id = ${id}::uuid`);
      if (!m) throw new NotFoundException();
      return m;
    });
  }

  atualizar(u: AuthUser, id: string, b: MetaPatch): Promise<{ version: number }> {
    return withUser(this.db, u.id, async (tx) => {
      const [m] = await tx.select().from(mentoriaMetas).where(eq(mentoriaMetas.id, id));
      if (!m) throw new NotFoundException();
      await exigirEdicao(tx, 'META', m.inscricaoId);
      if (b.pessoaId) await this.validarPessoa(tx, m.inscricaoId, b.pessoaId);
      const num = (v: number | null | undefined) =>
        v === undefined ? undefined : v === null ? null : String(v);
      const set = {
        ...(b.descricao !== undefined
          ? {
              descricao: this.crypto.cifrarTexto(
                b.descricao,
                aad('mentoria_metas', 'descricao', id),
              ),
            }
          : {}),
        ...(b.pilar !== undefined ? { pilar: b.pilar } : {}),
        ...(b.pessoaId !== undefined ? { pessoaId: b.pessoaId } : {}),
        ...(b.valorAlvo !== undefined ? { valorAlvo: num(b.valorAlvo) } : {}),
        ...(b.valorAtual !== undefined ? { valorAtual: num(b.valorAtual) } : {}),
        ...(b.unidade !== undefined ? { unidade: b.unidade } : {}),
        ...(b.prazo !== undefined ? { prazo: b.prazo } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
      };
      const campos = Object.keys(set);
      if (!campos.length) throw new BadRequestException('Nada para alterar');
      const [r] = await tx
        .update(mentoriaMetas)
        .set({ ...set, version: sql`${mentoriaMetas.version} + 1`, atualizadoEm: sql`now()` })
        .where(and(eq(mentoriaMetas.id, id), eq(mentoriaMetas.version, b.version)))
        .returning({ version: mentoriaMetas.version });
      if (!r) throw conflitoDeVersao();
      await registrarHistorico(tx, m.inscricaoId, 'meta.editada', campos);
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  excluir(u: AuthUser, id: string): Promise<void> {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_excluir_meta(${id}::uuid)`);
    }).catch((e) => erroDoBanco(e));
  }
}
