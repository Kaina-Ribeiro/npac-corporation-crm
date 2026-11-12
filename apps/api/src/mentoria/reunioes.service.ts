import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { mentoriaReunioes, withUser, type Db, type Tx } from '@npac/db';
import {
  SEM_REUNIAO_DIAS,
  taxaComparecimento,
  type AgendaFiltro,
  type AgendaSemana,
  type AuthUser,
  type ContatoCriar,
  type ContatoDTO,
  type Condutor,
  type ControleMensal,
  type ControleMensalFiltro,
  type LinhaControle,
  type LinhaSemReuniao,
  type ReuniaoCriar,
  type ReuniaoDTO,
  type ReuniaoItem,
  type ReuniaoPatch,
  type ReuniaoRemarcar,
  type ReuniaoTexto,
  type ReuniaoTipo,
  type SemReuniao,
  type SemReuniaoFiltro,
} from '@npac/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';
import { CiclosService, POR_REUNIAO } from './ciclos.service.js';
import { MetasService } from './metas.service.js';
import { PlanoService } from './plano.service.js';

const HOJE = sql`(now() at time zone 'America/Sao_Paulo')::date`;
/** `datetime-local` da tela, sempre em Brasília. */
const instante = (s: string) => sql`(${s}::timestamp at time zone 'America/Sao_Paulo')`;
const diaDe = (col: SQL) => sql`(${col} at time zone 'America/Sao_Paulo')::date`;

const TEXTOS: readonly ReuniaoTexto[] = [
  'resumo',
  'metas',
  'combinado',
  'cobrar',
  'trava',
  'anotacaoInterna',
];
const COLUNA: Record<ReuniaoTexto, string> = {
  resumo: 'resumo',
  metas: 'metas',
  combinado: 'combinado',
  cobrar: 'cobrar',
  trava: 'trava',
  anotacaoInterna: 'anotacao_interna',
};
const TEM_REGISTRO = sql`num_nonnulls(r.resumo, r.metas, r.combinado, r.cobrar, r.trava,
  r.anotacao_interna, r.humor, r.interesse_renovar) > 0`;
const PESSOAS = sql`(select json_agg(json_build_object('nome', p.nome, 'apelido', p.apelido,
  'fotoMidiaId', p.foto_midia_id) order by p.ordem)
  from mentoria_pessoas p where p.inscricao_id = i.id)`;

type LinhaReuniao = {
  id: string;
  version: number;
  inscricao_id: string;
  mentoria: ReuniaoItem['mentoria'];
  pessoas: ReuniaoItem['pessoas'];
  tipo: ReuniaoTipo;
  conduzida_por: string | null;
  condutor_nome: string | null;
  condutor_inscricao_id: string | null;
  condutor_inscricao_nome: string | null;
  inicio: Date;
  duracao_min: number;
  plataforma: ReuniaoItem['plataforma'];
  link: string | null;
  status: ReuniaoItem['status'];
  remarcada_para_id: string | null;
  ja_comecou: boolean;
  tem_registro: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
};

const emItem = (r: LinhaReuniao): ReuniaoItem => ({
  id: r.id,
  version: r.version,
  inscricaoId: r.inscricao_id,
  nome: (r.pessoas ?? []).map((p) => p.nome).join(' e '),
  pessoas: r.pessoas ?? [],
  mentoria: r.mentoria,
  tipo: r.tipo,
  conduzidaPor: r.conduzida_por ? { id: r.conduzida_por, nome: r.condutor_nome ?? '' } : null,
  condutorInscricao: r.condutor_inscricao_id
    ? { id: r.condutor_inscricao_id, nome: r.condutor_inscricao_nome ?? 'Mentorado experiente' }
    : null,
  inicio: new Date(r.inicio).toISOString(),
  duracaoMin: r.duracao_min,
  plataforma: r.plataforma,
  link: r.link,
  status: r.status,
  remarcadaParaId: r.remarcada_para_id,
  jaComecou: r.ja_comecou,
  temRegistro: r.tem_registro,
  podeEditar: r.pode_editar,
  podeExcluir: r.pode_excluir,
});

type Pessoas = LinhaControle['pessoas'];
const nomeDe = (p: Pessoas | null) => (p ?? []).map((x) => x.nome).join(' e ');

@Injectable()
export class ReunioesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    private readonly plano: PlanoService,
    private readonly ciclos: CiclosService,
    private readonly metas: MetasService,
  ) {}

  private consultar(tx: Tx, where: SQL[], limite = 500) {
    return tx.execute<LinhaReuniao>(sql`
      select r.id, r.version, r.inscricao_id, i.mentoria, ${PESSOAS} as pessoas, r.tipo,
        r.conduzida_por, u.name as condutor_nome, r.condutor_inscricao_id,
        (select string_agg(p.nome, ' e ' order by p.ordem) from mentoria_pessoas p
         where p.inscricao_id = r.condutor_inscricao_id) as condutor_inscricao_nome,
        r.inicio, r.duracao_min, r.plataforma, r.link, r.status, r.remarcada_para_id,
        r.inicio <= now() as ja_comecou, ${TEM_REGISTRO} as tem_registro,
        mentoria_edita_reuniao(r.conduzida_por, r.tipo, r.inscricao_id) as pode_editar,
        (r.status = 'AGENDADA' and not ${TEM_REGISTRO}
          and not exists (select 1 from mentoria_tarefas t where t.reuniao_id = r.id)
          and not exists (select 1 from mentoria_metas m where m.reuniao_id = r.id)
          and (mentoria_admin()
          or coalesce(mentoria_perfil() in ('ACOMPANHAMENTO', 'OPERACAO'), false))) as pode_excluir
      from mentoria_reunioes r
      join mentoria_inscricoes i on i.id = r.inscricao_id
      left join "user" u on u.id = r.conduzida_por
      where ${sql.join(where, sql` and `)}
      order by r.inicio, r.id
      limit ${limite}`);
  }

  /** As reuniões de uma inscrição, para a ficha (mais recentes primeiro). */
  async daInscricao(tx: Tx, inscricaoId: string): Promise<ReuniaoItem[]> {
    const linhas = await this.consultar(tx, [sql`r.inscricao_id = ${inscricaoId}::uuid`]);
    return [...linhas].map(emItem).reverse();
  }

  /** Os contatos de uma inscrição, para a ficha (mais recentes primeiro). */
  async contatosDaInscricao(tx: Tx, inscricaoId: string): Promise<ContatoDTO[]> {
    const linhas = await tx.execute<{
      id: string;
      quando: Date;
      canal: ContatoDTO['canal'];
      motivo: string | null;
      respondeu: boolean | null;
      tempo_resposta_min: number | null;
      observacao: string | null;
      feito_por: string;
    }>(sql`
      select c.id, c.quando, c.canal, c.motivo, c.respondeu, c.tempo_resposta_min, c.observacao,
        u.name as feito_por
      from mentoria_contatos c join "user" u on u.id = c.feito_por
      where c.inscricao_id = ${inscricaoId}::uuid
      order by c.quando desc, c.id
      limit 500`);
    return [...linhas].map((c) => ({
      id: c.id,
      quando: new Date(c.quando).toISOString(),
      canal: c.canal,
      motivo: c.motivo,
      respondeu: c.respondeu,
      tempoRespostaMin: c.tempo_resposta_min,
      observacao: this.crypto.decifrarOpcional(
        c.observacao,
        aad('mentoria_contatos', 'observacao', c.id),
      ),
      feitoPor: c.feito_por,
    }));
  }

  /**
   * Quem conduz (§4): usuário ativo, nulo só em MENTORADO_EXPERIENTE, que leva o mentorado
   * experiente (outra inscrição, visível a quem marca).
   */
  private async validarCondutor(
    tx: Tx,
    inscricaoId: string,
    tipo: ReuniaoTipo,
    conduzidaPor: string | null | undefined,
    condutorInscricaoId: string | null | undefined,
  ): Promise<void> {
    if (tipo === 'MENTORADO_EXPERIENTE') {
      if (!condutorInscricaoId)
        throw new BadRequestException('Escolha o mentorado experiente que conduz');
      if (condutorInscricaoId === inscricaoId)
        throw new BadRequestException('O mentorado experiente é outra pessoa');
      const [c] = await tx.execute<{ ok: boolean }>(sql`
        select exists (select 1 from mentoria_inscricoes where id = ${condutorInscricaoId}::uuid) as ok`);
      if (!c?.ok) throw new BadRequestException('Mentorado experiente não encontrado');
    } else {
      if (!conduzidaPor) throw new BadRequestException('Informe quem conduz a reunião');
      if (condutorInscricaoId)
        throw new BadRequestException('Só a conversa com mentorado experiente leva um mentorado');
    }
    if (conduzidaPor) {
      const [u] = await tx.execute<{ ok: boolean }>(sql`
        select exists (select 1 from "user" where id = ${conduzidaPor} and active) as ok`);
      if (!u?.ok) throw new BadRequestException('Escolha uma pessoa ativa para conduzir');
    }
  }

  private async inserir(
    tx: Tx,
    b: {
      inscricaoId: string;
      tipo: ReuniaoTipo;
      conduzidaPor: string | null;
      condutorInscricaoId: string | null;
      inicio: string;
      duracaoMin?: number;
      plataforma?: string | null;
      link?: string | null;
    },
  ): Promise<{ id: string; version: number }> {
    const [r] = await tx.execute<{ id: string; version: number }>(sql`
      insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, condutor_inscricao_id,
        inicio, duracao_min, plataforma, link)
      values (${b.inscricaoId}::uuid, ${b.tipo}, ${b.conduzidaPor}, ${b.condutorInscricaoId}::uuid,
        ${instante(b.inicio)}, ${b.duracaoMin ?? 60}, ${b.plataforma ?? null}, ${b.link ?? null})
      returning id, version`);
    await registrarHistorico(tx, b.inscricaoId, 'reuniao.agendada', [b.tipo]);
    return r!;
  }

  criar(u: AuthUser, b: ReuniaoCriar) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'REUNIAO', b.inscricaoId);
      await this.validarCondutor(tx, b.inscricaoId, b.tipo, b.conduzidaPor, b.condutorInscricaoId);
      return this.inserir(tx, {
        ...b,
        conduzidaPor: b.conduzidaPor ?? null,
        condutorInscricaoId: b.condutorInscricaoId ?? null,
      });
    }).catch((e) => erroDoBanco(e));
  }

  abrir(u: AuthUser, id: string): Promise<ReuniaoDTO> {
    return withUser(this.db, u.id, async (tx) => {
      const [item] = await this.consultar(tx, [sql`r.id = ${id}::uuid`], 1);
      if (!item) throw new NotFoundException();
      const [r] = await tx.select().from(mentoriaReunioes).where(eq(mentoriaReunioes.id, id));
      if (!r) throw new NotFoundException();
      const texto = (campo: ReuniaoTexto) =>
        this.crypto.decifrarOpcional(r[campo], aad('mentoria_reunioes', COLUNA[campo], id));
      const tarefas = await this.ciclos.tarefas(
        tx,
        sql`t.reuniao_id = ${id}::uuid and t.origem = 'REUNIAO'`,
        POR_REUNIAO,
      );
      // Cobrança (§4): a reunião anterior mais recente com tarefas que quem abre vê (RLS).
      const [ant] = await tx.execute<{ id: string; inicio: Date; tipo: ReuniaoTipo }>(sql`
        select a.id, a.inicio, a.tipo from mentoria_reunioes a
        where a.inscricao_id = ${r.inscricaoId}::uuid and a.id <> ${id}::uuid
          and a.inicio < ${new Date(r.inicio).toISOString()}::timestamptz
          and exists (select 1 from mentoria_tarefas t
                      where t.reuniao_id = a.id and t.origem = 'REUNIAO')
        order by a.inicio desc, a.id limit 1`);
      const cobranca = ant
        ? {
            reuniao: { id: ant.id, inicio: new Date(ant.inicio).toISOString(), tipo: ant.tipo },
            tarefas: await this.ciclos.tarefas(
              tx,
              sql`t.reuniao_id = ${ant.id}::uuid and t.origem = 'REUNIAO'`,
              POR_REUNIAO,
            ),
          }
        : null;
      const [pode] = await tx.execute<{ tarefa: boolean; meta: boolean }>(sql`
        select mentoria_edita_tarefa(${id}::uuid, ${r.inscricaoId}::uuid) as tarefa,
          mentoria_edita('META', ${r.inscricaoId}::uuid) as meta`);
      const pessoas = await tx.execute<{ id: string; nome: string }>(sql`
        select id, nome from mentoria_pessoas where inscricao_id = ${r.inscricaoId}::uuid
        order by ordem`);
      return {
        ...emItem(item),
        tarefas,
        cobranca,
        metasInscricao: await this.metas.daInscricao(tx, r.inscricaoId),
        pessoasDaInscricao: [...pessoas],
        podeTarefa: pode?.tarefa === true,
        podeMeta: pode?.meta === true,
        resumo: texto('resumo'),
        metas: texto('metas'),
        combinado: texto('combinado'),
        cobrar: texto('cobrar'),
        trava: texto('trava'),
        anotacaoInterna: texto('anotacaoInterna'),
        humor: r.humor,
        interesseRenovar: r.interesseRenovar,
      };
    });
  }

  atualizar(u: AuthUser, id: string, b: ReuniaoPatch) {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx
        .select()
        .from(mentoriaReunioes)
        .where(eq(mentoriaReunioes.id, id))
        .for('update');
      if (!r) throw new NotFoundException();
      const [q] = await tx.execute<{ ok: boolean }>(sql`
        select mentoria_edita_reuniao(${r.conduzidaPor}, ${r.tipo}, ${r.inscricaoId}::uuid) as ok`);
      if (!q?.ok) throw new NotFoundException();
      const tipo = r.tipo as ReuniaoTipo;

      const { version, status, proxima, humor, interesseRenovar, ...resto } = b;
      if (interesseRenovar !== undefined && interesseRenovar !== null && tipo !== 'RENOVACAO')
        throw new BadRequestException('Interesse em renovar só na reunião de renovação');
      const mudaCondutor =
        resto.conduzidaPor !== undefined || resto.condutorInscricaoId !== undefined;
      const conduzidaPor = resto.conduzidaPor !== undefined ? resto.conduzidaPor : r.conduzidaPor;
      const condutorInscricaoId =
        resto.condutorInscricaoId !== undefined ? resto.condutorInscricaoId : r.condutorInscricaoId;
      if (mudaCondutor)
        await this.validarCondutor(tx, r.inscricaoId, tipo, conduzidaPor, condutorInscricaoId);

      const textos: Partial<Record<ReuniaoTexto, string | null>> = {};
      for (const campo of TEXTOS) {
        const v = resto[campo];
        if (v !== undefined)
          textos[campo] = this.crypto.cifrarOpcional(
            v,
            aad('mentoria_reunioes', COLUNA[campo], id),
          );
      }
      const [novo] = await tx
        .update(mentoriaReunioes)
        .set({
          ...textos,
          ...(mudaCondutor ? { conduzidaPor, condutorInscricaoId } : {}),
          ...(resto.duracaoMin !== undefined ? { duracaoMin: resto.duracaoMin } : {}),
          ...(resto.plataforma !== undefined ? { plataforma: resto.plataforma } : {}),
          ...(resto.link !== undefined ? { link: resto.link } : {}),
          ...(humor !== undefined ? { humor } : {}),
          ...(interesseRenovar !== undefined ? { interesseRenovar } : {}),
          ...(status !== undefined ? { status } : {}),
          version: sql`${mentoriaReunioes.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(and(eq(mentoriaReunioes.id, id), eq(mentoriaReunioes.version, version)))
        .returning({ version: mentoriaReunioes.version });
      if (!novo) throw conflitoDeVersao();

      const mudouStatus = status !== undefined && status !== r.status;
      const campos = Object.keys(b).filter((k) => !['version', 'proxima', 'status'].includes(k));
      await registrarHistorico(
        tx,
        r.inscricaoId,
        mudouStatus ? `reuniao.${status!.toLowerCase()}` : 'reuniao.registrada',
        [tipo, ...(mudouStatus ? ['status'] : []), ...campos],
      );
      if (mudouStatus && status === 'REALIZADA' && tipo === 'IDR')
        await this.iniciarPelaIdr(tx, r.inscricaoId);

      let proximaId: string | undefined;
      if (proxima) {
        const tipoProxima = proxima.tipo ?? tipo;
        const mesmoTipo = tipoProxima === tipo;
        await this.validarCondutor(
          tx,
          r.inscricaoId,
          tipoProxima,
          conduzidaPor,
          mesmoTipo ? condutorInscricaoId : null,
        );
        proximaId = (
          await this.inserir(tx, {
            inscricaoId: r.inscricaoId,
            tipo: tipoProxima,
            conduzidaPor,
            condutorInscricaoId: mesmoTipo ? condutorInscricaoId : null,
            inicio: proxima.inicio,
            duracaoMin: r.duracaoMin,
            plataforma: r.plataforma,
            link: r.link,
          })
        ).id;
      }
      return { version: novo.version, ...(proximaId ? { proximaId } : {}) };
    }).catch((e) => erroDoBanco(e));
  }

  /**
   * IDR realizada (§5, Tarefa 4.2): na mesma transação, `data_idr` e o início da jornada = a data de
   * Brasília da reunião, status ATIVO e as ações do plano. Só a primeira IDR realizada inicia; o
   * início já definido (2M/6M que fechou o onboarding, ou importado) não muda.
   */
  private async iniciarPelaIdr(tx: Tx, inscricaoId: string): Promise<void> {
    const [i] = await tx.execute<{
      data_idr: string | null;
      inicio: string | null;
      dia: string;
    }>(sql`
      select i.data_idr, i.inicio_jornada as inicio,
        (select to_char(min(${diaDe(sql`r.inicio`)}), 'YYYY-MM-DD') from mentoria_reunioes r
         where r.inscricao_id = i.id and r.tipo = 'IDR' and r.status = 'REALIZADA') as dia
      from mentoria_inscricoes i where i.id = ${inscricaoId}::uuid for update of i`);
    if (!i || i.data_idr) return;
    await tx.execute(sql`update mentoria_inscricoes set
        data_idr = ${i.dia}::date,
        status = case when status = 'ONBOARDING' then 'ATIVO' else status end,
        version = version + 1,
        atualizado_em = now()
      where id = ${inscricaoId}::uuid`);
    if (!i.inicio) await this.plano.definirInicio(tx, inscricaoId, i.dia);
    await registrarHistorico(tx, inscricaoId, 'idr.realizada', [
      'dataIdr',
      ...(i.inicio ? [] : ['inicioJornada']),
      'status',
    ]);
  }

  remarcar(u: AuthUser, id: string, b: ReuniaoRemarcar) {
    const nova = randomUUID();
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_remarcar_reuniao(${id}::uuid, ${nova}::uuid,
        ${instante(b.inicio)}, ${b.version}::int)`);
      return { id: nova };
    }).catch((e) => erroDoBanco(e));
  }

  excluir(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_excluir_reuniao(${id}::uuid)`);
    }).catch((e) => erroDoBanco(e));
  }

  /** Agenda de segunda a domingo (Brasília) da semana de `dia`, sem as remarcadas. */
  agenda(u: AuthUser, f: AgendaFiltro): Promise<AgendaSemana> {
    return withUser(this.db, u.id, async (tx) => {
      const base = f.dia ? sql`${f.dia}::date` : HOJE;
      const [p] = await tx.execute<{ hoje: string; inicio: string; fim: string }>(sql`
        select to_char(${HOJE}, 'YYYY-MM-DD') as hoje,
          to_char(date_trunc('week', ${base})::date, 'YYYY-MM-DD') as inicio,
          to_char(date_trunc('week', ${base})::date + 6, 'YYYY-MM-DD') as fim`);
      const where: SQL[] = [
        sql`r.status <> 'REMARCADA'`,
        sql`r.inicio >= (${p!.inicio}::date::timestamp at time zone 'America/Sao_Paulo')`,
        sql`r.inicio < ((${p!.fim}::date + 1)::timestamp at time zone 'America/Sao_Paulo')`,
      ];
      if (f.condutorId) where.push(sql`r.conduzida_por = ${f.condutorId}`);
      const linhas = await this.consultar(tx, where);
      return { hoje: p!.hoje, inicio: p!.inicio, fim: p!.fim, reunioes: [...linhas].map(emItem) };
    });
  }

  /** Quem teve reunião realizada no mês (todas as mentorias, D17) e quem falta, entre os ativos. */
  controleMensal(u: AuthUser, f: ControleMensalFiltro): Promise<ControleMensal> {
    return withUser(this.db, u.id, async (tx) => {
      const mes =
        f.mes ??
        (await tx.execute<{ mes: string }>(sql`select to_char(${HOJE}, 'YYYY-MM') as mes`))[0]!.mes;
      const ini = sql`(${`${mes}-01`}::date::timestamp at time zone 'America/Sao_Paulo')`;
      const fim = sql`((${`${mes}-01`}::date + interval '1 month')::timestamp at time zone 'America/Sao_Paulo')`;
      const filtro = f.mentoria ? sql`and i.mentoria = ${f.mentoria}` : sql``;
      const linhas = await tx.execute<{
        inscricao_id: string;
        mentoria: LinhaControle['mentoria'];
        pessoas: Pessoas;
        realizadas: number;
        agendada: Date | null;
        ultima: string | null;
      }>(sql`
        select i.id as inscricao_id, i.mentoria, ${PESSOAS} as pessoas,
          (select count(*)::int from mentoria_reunioes r where r.inscricao_id = i.id
             and r.status = 'REALIZADA' and r.inicio >= ${ini} and r.inicio < ${fim}) as realizadas,
          (select min(r.inicio) from mentoria_reunioes r where r.inscricao_id = i.id
             and r.status in ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO')
             and r.inicio >= ${ini} and r.inicio < ${fim}) as agendada,
          (select to_char(max(${diaDe(sql`r.inicio`)}), 'YYYY-MM-DD') from mentoria_reunioes r
             where r.inscricao_id = i.id and r.status = 'REALIZADA') as ultima
        from mentoria_inscricoes i
        join mentoria_pessoas p1 on p1.inscricao_id = i.id and p1.ordem = 1
        where i.status = 'ATIVO' ${filtro}
        order by p1.nome_norm, i.id`);
      const [c] = await tx.execute<{ realizadas: number; faltas: number }>(sql`
        select count(*) filter (where r.status = 'REALIZADA')::int as realizadas,
          count(*) filter (where r.status = 'FALTOU')::int as faltas
        from mentoria_reunioes r join mentoria_inscricoes i on i.id = r.inscricao_id
        where r.inicio >= ${ini} and r.inicio < ${fim} ${filtro}`);
      const fizeram: LinhaControle[] = [];
      const faltam: LinhaControle[] = [];
      for (const l of linhas) {
        const linha: LinhaControle = {
          inscricaoId: l.inscricao_id,
          nome: nomeDe(l.pessoas),
          pessoas: l.pessoas ?? [],
          mentoria: l.mentoria,
          realizadas: l.realizadas,
          agendada: l.agendada ? new Date(l.agendada).toISOString() : null,
          ultimaRealizada: l.ultima,
        };
        (l.realizadas > 0 ? fizeram : faltam).push(linha);
      }
      const realizadas = c?.realizadas ?? 0;
      const faltas = c?.faltas ?? 0;
      return {
        mes,
        fizeram,
        faltam,
        comparecimento: { realizadas, faltas, taxa: taxaComparecimento(realizadas, faltas) },
      };
    });
  }

  /**
   * Ativos sem reunião realizada há mais de 30 dias (§6): conta da última realizada; sem nenhuma,
   * da IDR, da importação, do início da jornada ou do cadastro. Assim a carteira importada não
   * aparece inteira no primeiro dia.
   */
  semReuniao(u: AuthUser, f: SemReuniaoFiltro): Promise<SemReuniao> {
    return withUser(this.db, u.id, async (tx) => {
      const filtro = f.mentoria ? sql`and i.mentoria = ${f.mentoria}` : sql``;
      const linhas = await tx.execute<{
        inscricao_id: string;
        mentoria: LinhaSemReuniao['mentoria'];
        pessoas: Pessoas;
        responsavel: string | null;
        desde: string;
        base: LinhaSemReuniao['base'];
        dias: number;
      }>(sql`
        select x.*, (${HOJE} - x.desde_d)::int as dias, to_char(x.desde_d, 'YYYY-MM-DD') as desde
        from (
          select i.id as inscricao_id, i.mentoria, ${PESSOAS} as pessoas, u.name as responsavel,
            p1.nome_norm,
            coalesce(ult.dia, i.data_idr,
              case when i.importada then ${diaDe(sql`i.criado_em`)} end,
              i.inicio_jornada, ${diaDe(sql`i.criado_em`)}) as desde_d,
            case when ult.dia is not null then 'REUNIAO'
                 when i.data_idr is not null then 'IDR'
                 when i.importada then 'IMPORTACAO'
                 when i.inicio_jornada is not null then 'INICIO'
                 else 'CADASTRO' end as base
          from mentoria_inscricoes i
          join mentoria_pessoas p1 on p1.inscricao_id = i.id and p1.ordem = 1
          left join "user" u on u.id = i.responsavel_id
          left join lateral (
            select max(${diaDe(sql`r.inicio`)}) as dia from mentoria_reunioes r
            where r.inscricao_id = i.id and r.status = 'REALIZADA') ult on true
          where i.status = 'ATIVO' ${filtro}
        ) x
        where ${HOJE} - x.desde_d > ${SEM_REUNIAO_DIAS}
        order by x.desde_d, x.nome_norm, x.inscricao_id
        limit 500`);
      return {
        itens: [...linhas].map((l) => ({
          inscricaoId: l.inscricao_id,
          nome: nomeDe(l.pessoas),
          pessoas: l.pessoas ?? [],
          mentoria: l.mentoria,
          responsavel: l.responsavel,
          desde: l.desde,
          base: l.base,
          dias: l.dias,
        })),
      };
    });
  }

  /** Qualquer usuário ativo pode conduzir; quem tem perfil no módulo aparece com ele. */
  condutores(u: AuthUser): Promise<Condutor[]> {
    return withUser(this.db, u.id, async (tx) => {
      const linhas = await tx.execute<{ id: string; nome: string; perfil: Condutor['perfil'] }>(sql`
        select u.id, u.name as nome, p.perfil from "user" u
        left join mentoria_perfis p on p.user_id = u.id
        where u.active order by u.name, u.id`);
      return [...linhas];
    });
  }

  registrarContato(u: AuthUser, b: ContatoCriar) {
    const id = randomUUID();
    const observacao = this.crypto.cifrarOpcional(
      b.observacao ?? null,
      aad('mentoria_contatos', 'observacao', id),
    );
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'CONTATO', b.inscricaoId);
      await tx.execute(sql`
        insert into mentoria_contatos (id, inscricao_id, feito_por, quando, canal, motivo, respondeu,
          tempo_resposta_min, observacao)
        values (${id}::uuid, ${b.inscricaoId}::uuid, app_user_id(),
          ${b.quando ? instante(b.quando) : sql`now()`}, ${b.canal}, ${b.motivo ?? null},
          ${b.respondeu ?? null}, ${b.tempoRespostaMin ?? null}, ${observacao})`);
      await registrarHistorico(tx, b.inscricaoId, 'contato.registrado', [b.canal]);
      return { id };
    }).catch((e) => erroDoBanco(e));
  }
}
