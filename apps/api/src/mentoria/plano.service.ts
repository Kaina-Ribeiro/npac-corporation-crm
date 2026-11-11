import { hkdfSync } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  mentoriaAcoes,
  mentoriaInscricoes,
  mentoriaPlanoModelo,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  aplicarPassos,
  type AcaoDTO,
  type AcaoItem,
  type AcaoPatch,
  type AcaoStatus,
  type AuthUser,
  type DataIdrPut,
  type PaginaAcoes,
  type PlanoLista,
  type PlanoModeloLinha,
  type PlanoModeloPut,
  type PlanoSemana,
} from '@npac/shared';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { CursorSigner } from './cursor.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

const HOJE = sql`(now() at time zone 'America/Sao_Paulo')::date`;
const PAGINA = 50;
const LIMITE_ATRASADAS = 100;

/** Só o que está em andamento entra nas visões gerais: pausado some, como na Fila (D15). */
const EM_ANDAMENTO = sql`i.status in ('ONBOARDING', 'ATIVO')`;
const ATRASADA = sql`mentoria_acao_atrasada(a.status, a.anterior_ao_sistema, a.data_limite, ${HOJE})`;

type LinhaAcao = {
  id: string;
  version: number;
  inscricao_id: string;
  pessoas: AcaoItem['pessoas'];
  mentoria: AcaoItem['mentoria'];
  mes: number;
  foco: string;
  acao: string;
  reuniao_tipo: AcaoItem['reuniaoTipo'];
  gatilho: AcaoItem['gatilho'];
  itens: string[];
  itens_feitos: string[];
  data_prevista: string;
  data_limite: string;
  responsavel_perfil: AcaoItem['responsavelPerfil'];
  responsavel: string | null;
  status: AcaoItem['status'];
  atrasada: boolean;
  anterior_ao_sistema: boolean;
  feita_em: string | null;
  feita_por: string | null;
  pode_editar: boolean;
};

const emItem = (r: LinhaAcao): AcaoItem => ({
  id: r.id,
  version: r.version,
  inscricaoId: r.inscricao_id,
  nome: r.pessoas.map((p) => p.nome).join(' e '),
  pessoas: r.pessoas,
  mentoria: r.mentoria,
  mes: r.mes,
  foco: r.foco,
  acao: r.acao,
  reuniaoTipo: r.reuniao_tipo,
  gatilho: r.gatilho,
  itens: r.itens,
  itensFeitos: r.itens_feitos,
  dataPrevista: r.data_prevista,
  dataLimite: r.data_limite,
  responsavelPerfil: r.responsavel_perfil,
  responsavel: r.responsavel,
  status: r.status,
  atrasada: r.atrasada,
  anteriorAoSistema: r.anterior_ao_sistema,
  feitaEm: r.feita_em,
  feitaPor: r.feita_por,
  podeEditar: r.pode_editar,
});

@Injectable()
export class PlanoService {
  private readonly cursor: CursorSigner;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) env: Env,
    private readonly crypto: MentoriaCrypto,
  ) {
    const key = hkdfSync('sha256', env.BETTER_AUTH_SECRET, '', 'npac:mentoria:cursor-acoes', 32);
    this.cursor = new CursorSigner(Buffer.from(key));
  }

  /** Gera o que falta do plano, se a jornada já tem início. Idempotente. */
  async gerar(tx: Tx, inscricaoId: string): Promise<void> {
    await tx.execute(sql`select mentoria_gerar_acoes(${inscricaoId}::uuid, ${HOJE})`);
  }

  /** Início da jornada: grava o início, o término de 12 meses e gera as ações. */
  async definirInicio(tx: Tx, inscricaoId: string, inicio: string): Promise<void> {
    await tx.execute(sql`update mentoria_inscricoes set
        inicio_jornada = ${inicio}::date,
        termino_previsto = coalesce(termino_previsto, (${inicio}::date + interval '12 months')::date),
        atualizado_em = now()
      where id = ${inscricaoId}::uuid`);
    await this.gerar(tx, inscricaoId);
  }

  async temAcoes(tx: Tx, inscricaoId: string): Promise<boolean> {
    const [r] = await tx.execute<{ tem: boolean }>(sql`select exists (
      select 1 from mentoria_acoes where inscricao_id = ${inscricaoId}::uuid) as tem`);
    return r?.tem === true;
  }

  /** Quem pode mexer em um plano já começado: Admin e Acompanhamento (§5). */
  async editaPlano(tx: Tx, inscricaoId: string): Promise<boolean> {
    const [r] = await tx.execute<{ ok: boolean }>(
      sql`select mentoria_edita('PLANO', ${inscricaoId}::uuid) as ok`,
    );
    return r?.ok === true;
  }

  /**
   * O início mudou: refaz as datas das pendentes e gera o que faltava. O término acompanha, exceto
   * se a equipe o tiver editado à mão. `antes` é o que estava gravado antes da mudança.
   */
  async aplicarInicio(
    tx: Tx,
    inscricaoId: string,
    inicio: string,
    antes: { inicio: string | null; termino: string | null },
  ): Promise<void> {
    await tx.execute(sql`update mentoria_inscricoes set termino_previsto =
        case when ${antes.termino}::date is null or ${antes.inicio}::date is null
            or ${antes.termino}::date = mentoria_data_ajustada(id, ${antes.inicio}::date,
              (${antes.inicio}::date + interval '12 months')::date)
          then mentoria_data_ajustada(id, ${inicio}::date,
              (${inicio}::date + interval '12 months')::date)
          else termino_previsto end
      where id = ${inscricaoId}::uuid`);
    if (await this.temAcoes(tx, inscricaoId))
      await tx.execute(sql`select mentoria_recalcular_acoes(${inscricaoId}::uuid, ${HOJE})`);
    await this.gerar(tx, inscricaoId);
  }

  async trocarPlano(tx: Tx, inscricaoId: string): Promise<void> {
    await tx.execute(sql`select mentoria_trocar_plano(${inscricaoId}::uuid, ${HOJE})`);
  }

  private consultar(tx: Tx, where: SQL[], ordem: SQL, limite: number) {
    const filtro = where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``;
    return tx.execute<LinhaAcao>(sql`
      select a.id, a.version, a.inscricao_id, i.mentoria, a.mes, a.foco, a.acao, a.reuniao_tipo,
        a.gatilho, a.itens, a.itens_feitos,
        to_char(a.data_prevista, 'YYYY-MM-DD') as data_prevista,
        to_char(a.data_limite, 'YYYY-MM-DD') as data_limite,
        a.responsavel_perfil, u.name as responsavel, a.status, ${ATRASADA} as atrasada,
        a.anterior_ao_sistema, a.feita_em, f.name as feita_por,
        mentoria_edita_acao(a.responsavel_perfil, a.inscricao_id) as pode_editar,
        (select json_agg(json_build_object('nome', p.nome, 'apelido', p.apelido,
           'fotoMidiaId', p.foto_midia_id) order by p.ordem)
         from mentoria_pessoas p where p.inscricao_id = i.id) as pessoas
      from mentoria_acoes a
      join mentoria_inscricoes i on i.id = a.inscricao_id
      left join "user" u on u.id = a.responsavel_id
      left join "user" f on f.id = a.feita_por
      ${filtro}
      order by ${ordem}
      limit ${limite}`);
  }

  /** As ações de uma inscrição, para a ficha. */
  async daInscricao(tx: Tx, inscricaoId: string): Promise<AcaoItem[]> {
    const linhas = await this.consultar(
      tx,
      [sql`a.inscricao_id = ${inscricaoId}::uuid`],
      sql`a.mes, a.data_prevista, a.id`,
      500,
    );
    return [...linhas].map(emItem);
  }

  listar(u: AuthUser, f: PlanoLista): Promise<PaginaAcoes> {
    return withUser(this.db, u.id, async (tx) => {
      const where: SQL[] = [];
      if (f.inscricaoId) where.push(sql`a.inscricao_id = ${f.inscricaoId}::uuid`);
      else where.push(EM_ANDAMENTO);
      if (f.mes) where.push(sql`a.mes = ${f.mes}`);
      if (f.situacao === 'ATRASADA') where.push(ATRASADA);
      else if (f.situacao) where.push(sql`a.status = ${f.situacao}`);
      let depois: SQL | undefined;
      if (f.cursor) {
        const id = this.cursor.verify(f.cursor);
        depois = sql`(a.data_prevista, a.id) > (
          select x.data_prevista, x.id from mentoria_acoes x where x.id = ${id}::uuid)`;
      }
      const linhas = await this.consultar(
        tx,
        depois ? [...where, depois] : where,
        sql`a.data_prevista, a.id`,
        PAGINA + 1,
      );
      const pagina = [...linhas].slice(0, PAGINA);
      const [t] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from mentoria_acoes a
        join mentoria_inscricoes i on i.id = a.inscricao_id
        where ${sql.join(where, sql` and `)}`);
      return {
        itens: pagina.map(emItem),
        cursor: linhas.length > PAGINA ? this.cursor.sign(pagina.at(-1)!.id) : null,
        total: t?.n ?? 0,
      };
    });
  }

  /** Atrasadas e o que vence de segunda a domingo. Anterior ao sistema não alerta (§7). */
  semana(u: AuthUser): Promise<PlanoSemana> {
    return withUser(this.db, u.id, async (tx) => {
      const [p] = await tx.execute<{ hoje: string; inicio: string; fim: string }>(sql`
        select to_char(${HOJE}, 'YYYY-MM-DD') as hoje,
          to_char(date_trunc('week', ${HOJE})::date, 'YYYY-MM-DD') as inicio,
          to_char(date_trunc('week', ${HOJE})::date + 6, 'YYYY-MM-DD') as fim`);
      const atrasadas = await this.consultar(
        tx,
        [EM_ANDAMENTO, ATRASADA],
        sql`a.data_limite, a.id`,
        LIMITE_ATRASADAS,
      );
      const [t] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from mentoria_acoes a
        join mentoria_inscricoes i on i.id = a.inscricao_id
        where ${EM_ANDAMENTO} and ${ATRASADA}`);
      const semana = await this.consultar(
        tx,
        [
          EM_ANDAMENTO,
          sql`a.status = 'PENDENTE'`,
          sql`not a.anterior_ao_sistema`,
          sql`not ${ATRASADA}`,
          sql`a.data_prevista between ${p!.inicio}::date and ${p!.fim}::date`,
        ],
        sql`a.data_prevista, a.id`,
        500,
      );
      return {
        hoje: p!.hoje,
        inicio: p!.inicio,
        fim: p!.fim,
        atrasadas: [...atrasadas].map(emItem),
        atrasadasTotal: t?.n ?? 0,
        semana: [...semana].map(emItem),
      };
    });
  }

  abrirAcao(u: AuthUser, id: string): Promise<AcaoDTO> {
    return withUser(this.db, u.id, async (tx) => {
      const [item] = await this.consultar(tx, [sql`a.id = ${id}::uuid`], sql`a.id`, 1);
      if (!item) throw new NotFoundException();
      const [a] = await tx.select().from(mentoriaAcoes).where(eq(mentoriaAcoes.id, id));
      if (!a) throw new NotFoundException();
      return {
        ...emItem(item),
        evidenciaLink: a.evidenciaLink,
        evidenciaMidiaId: a.evidenciaMidiaId,
        observacao: this.crypto.decifrarOpcional(
          a.observacao,
          aad('mentoria_acoes', 'observacao', id),
        ),
      };
    });
  }

  atualizarAcao(u: AuthUser, id: string, b: AcaoPatch) {
    return withUser(this.db, u.id, async (tx) => {
      const [a] = await tx.select().from(mentoriaAcoes).where(eq(mentoriaAcoes.id, id));
      if (!a) throw new NotFoundException();
      const [q] = await tx.execute<{ ok: boolean }>(
        sql`select mentoria_edita_acao(${a.responsavelPerfil}, ${a.inscricaoId}::uuid) as ok`,
      );
      if (!q?.ok) throw new NotFoundException();

      const { version, status, itensFeitos, observacao, evidenciaLink } = b;
      const estado = aplicarPassos(
        { status: a.status as AcaoStatus, itens: a.itens, itensFeitos: a.itensFeitos },
        { status, itensFeitos },
      );
      const mudouStatus = estado.status !== a.status;
      const [r] = await tx
        .update(mentoriaAcoes)
        .set({
          status: estado.status,
          itensFeitos: estado.itensFeitos,
          ...(mudouStatus
            ? estado.status === 'FEITA'
              ? { feitaEm: sql`now()` as unknown as Date, feitaPor: u.id }
              : { feitaEm: null, feitaPor: null }
            : {}),
          ...(evidenciaLink !== undefined ? { evidenciaLink } : {}),
          ...(observacao !== undefined
            ? {
                observacao: this.crypto.cifrarOpcional(
                  observacao,
                  aad('mentoria_acoes', 'observacao', id),
                ),
              }
            : {}),
          version: sql`${mentoriaAcoes.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(and(eq(mentoriaAcoes.id, id), eq(mentoriaAcoes.version, version)))
        .returning({ version: mentoriaAcoes.version, status: mentoriaAcoes.status });
      if (!r) throw conflitoDeVersao();

      const campos = [
        ...(itensFeitos !== undefined ? ['itensFeitos'] : []),
        ...(evidenciaLink !== undefined ? ['evidenciaLink'] : []),
        ...(observacao !== undefined ? ['observacao'] : []),
        ...(mudouStatus ? ['status'] : []),
      ];
      const tipo = !mudouStatus
        ? 'acao.editada'
        : estado.status === 'FEITA'
          ? 'acao.feita'
          : 'acao.reaberta';
      await registrarHistorico(tx, a.inscricaoId, tipo, [`mes_${a.mes}`, ...campos]);
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  /** Informa ou corrige a data da IDR. Agendar e realizar a primeira é com a aba Reuniões. */
  corrigirIdr(u: AuthUser, id: string, b: DataIdrPut) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'PLANO', id);
      const [i] = await tx
        .select({
          importada: mentoriaInscricoes.importada,
          dataIdr: mentoriaInscricoes.dataIdr,
          inicio: mentoriaInscricoes.inicioJornada,
          termino: mentoriaInscricoes.terminoPrevisto,
        })
        .from(mentoriaInscricoes)
        .where(eq(mentoriaInscricoes.id, id))
        .for('update');
      if (!i) throw new NotFoundException();
      if (!i.importada && !i.dataIdr)
        throw new BadRequestException('A IDR ainda não aconteceu: registre pela reunião');
      const [h] = await tx.execute<{ hoje: string }>(
        sql`select to_char(${HOJE}, 'YYYY-MM-DD') as hoje`,
      );
      if (b.dataIdr > h!.hoje) throw new BadRequestException('A IDR não pode ser no futuro');
      const [r] = await tx
        .update(mentoriaInscricoes)
        .set({
          dataIdr: b.dataIdr,
          inicioJornada: b.dataIdr,
          version: sql`${mentoriaInscricoes.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(and(eq(mentoriaInscricoes.id, id), eq(mentoriaInscricoes.version, b.version)))
        .returning({ version: mentoriaInscricoes.version });
      if (!r) throw conflitoDeVersao();
      await this.aplicarInicio(tx, id, b.dataIdr, { inicio: i.inicio, termino: i.termino });
      await registrarHistorico(tx, id, 'idr.corrigida', ['dataIdr', 'inicioJornada']);
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  modelo(u: AuthUser): Promise<PlanoModeloLinha[]> {
    return withUser(this.db, u.id, async (tx) => {
      const linhas = await tx
        .select()
        .from(mentoriaPlanoModelo)
        .orderBy(
          asc(mentoriaPlanoModelo.mentoria),
          asc(mentoriaPlanoModelo.mes),
          asc(mentoriaPlanoModelo.reuniaoTipo),
        );
      return linhas.map((l): PlanoModeloLinha => ({
        id: l.id,
        version: l.version,
        mentoria: l.mentoria as PlanoModeloLinha['mentoria'],
        mes: l.mes,
        reuniaoTipo: l.reuniaoTipo as PlanoModeloLinha['reuniaoTipo'],
        foco: l.foco,
        acao: l.acao,
        itens: l.itens,
        responsavelPerfil: l.responsavelPerfil as PlanoModeloLinha['responsavelPerfil'],
        gatilho: l.gatilho as PlanoModeloLinha['gatilho'],
        diasParaExecutar: l.diasParaExecutar,
        segueCalendario: l.segueCalendario,
        ativo: l.ativo,
      }));
    });
  }

  /** Sem `id`, cria; com `id` e `version`, muda os campos enviados. Vale para as próximas gerações. */
  salvarModelo(u: AuthUser, b: PlanoModeloPut) {
    return withUser(this.db, u.id, async (tx) => {
      const { id, version, ...campos } = b;
      if (!id) {
        const { mentoria, mes, foco, acao, responsavelPerfil } = campos;
        if (!mentoria || !mes || !foco || !acao || !responsavelPerfil)
          throw new BadRequestException('Informe mentoria, mês, foco, ação e responsável');
        const [r] = await tx
          .insert(mentoriaPlanoModelo)
          .values({ ...campos, mentoria, mes, foco, acao, responsavelPerfil, criadoPor: u.id })
          .returning({ id: mentoriaPlanoModelo.id, version: mentoriaPlanoModelo.version });
        return r!;
      }
      if (version === undefined) throw new BadRequestException('Informe a versão');
      if (campos.mentoria !== undefined)
        throw new BadRequestException('A mentoria de uma linha não muda');
      const [r] = await tx
        .update(mentoriaPlanoModelo)
        .set({
          ...campos,
          version: sql`${mentoriaPlanoModelo.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(and(eq(mentoriaPlanoModelo.id, id), eq(mentoriaPlanoModelo.version, version)))
        .returning({ id: mentoriaPlanoModelo.id, version: mentoriaPlanoModelo.version });
      if (r) return r;
      const [existe] = await tx
        .select({ id: mentoriaPlanoModelo.id })
        .from(mentoriaPlanoModelo)
        .where(eq(mentoriaPlanoModelo.id, id));
      if (!existe) throw new NotFoundException();
      throw conflitoDeVersao();
    }).catch((e) => erroDoBanco(e));
  }
}
