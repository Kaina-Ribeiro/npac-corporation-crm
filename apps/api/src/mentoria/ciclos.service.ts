import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { mentoriaCiclos, mentoriaTarefas, withUser, type Db, type Tx } from '@npac/db';
import {
  encerramentoPadrao,
  tarefaPedeMotivo,
  ULTIMO_PME,
  type AuthUser,
  type CicloAnterior,
  type CicloDTO,
  type CicloPatch,
  type EnvioPme,
  type TarefaCriar,
  type TarefaDTO,
  type TarefaPatch,
  type TarefaStatus,
} from '@npac/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';
import { MENTORIA_CLOCK, type Clock } from './relogio.js';

const DIA_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

type LinhaCiclo = Omit<CicloDTO, 'tarefas'>;
type LinhaTarefa = Omit<TarefaDTO, 'descricao' | 'motivo' | 'reuniaoInicio'> & {
  descricao: string | null;
  motivo: string | null;
  reuniaoInicio: Date | string | null;
};

/** Ordem das tarefas no ciclo (card do PME): a do catálogo. */
const POR_CICLO = sql`t.ciclo_id, t.ordem, t.criado_em, t.id`;
/** Ordem das tarefas da reunião (ficha): da reunião mais recente, na ordem em que foram combinadas. */
export const POR_REUNIAO = sql`r.inicio desc nulls last, t.ordem, t.criado_em, t.id`;

/**
 * PMEs e ciclos (Fase 2, Parte 1, spec §3). O status do ciclo é do banco
 * (`mentoria_ciclo_status`), com o `hoje` do relógio do módulo. Envio, extras e encerramento
 * nascem numa transação; a tarefa de encerramento feita fecha o ciclo por gatilho.
 */
@Injectable()
export class CiclosService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    @Inject(MENTORIA_CLOCK) private readonly clock: Clock,
  ) {}

  /** Dia de Brasília (`AAAA-MM-DD`) pelo relógio do módulo. */
  hoje(): string {
    return DIA_BR.format(new Date(this.clock.now()));
  }

  private decifrar(t: LinhaTarefa): TarefaDTO {
    return {
      ...t,
      reuniaoInicio: t.reuniaoInicio ? new Date(t.reuniaoInicio).toISOString() : null,
      descricao: this.crypto.decifrarOpcional(
        t.descricao,
        aad('mentoria_tarefas', 'descricao', t.id),
      ),
      motivo: this.crypto.decifrarOpcional(t.motivo, aad('mentoria_tarefas', 'motivo', t.id)),
    };
  }

  /** Tarefas pelo filtro (RLS: a Especialista só as das próprias reuniões). */
  async tarefas(tx: Tx, filtro: SQL, ordem: SQL = POR_CICLO): Promise<TarefaDTO[]> {
    const linhas = await tx.execute<LinhaTarefa>(sql`
      select t.id, t.version, t.inscricao_id as "inscricaoId", t.origem, t.ciclo_id as "cicloId",
        t.reuniao_id as "reuniaoId", t.descricao, to_char(t.prazo, 'YYYY-MM-DD') as prazo,
        t.status, t.motivo, t.comprovante_midia_id as "comprovanteMidiaId",
        m.tipo as "comprovanteTipo", t.cobrada_em as "cobradaEm", u.name as "cobradaPor",
        t.meta_id as "metaId", c.numero as "cicloNumero", r.inicio as "reuniaoInicio",
        r.tipo as "reuniaoTipo",
        mentoria_edita_tarefa(t.reuniao_id, t.inscricao_id) as "podeEditar"
      from mentoria_tarefas t
      left join mentoria_midia m on m.id = t.comprovante_midia_id
      left join "user" u on u.id = t.cobrada_por
      left join mentoria_ciclos c on c.id = t.ciclo_id
      left join mentoria_reunioes r on r.id = t.reuniao_id
      where ${filtro}
      order by ${ordem}
      limit 1000`);
    return linhas.map((t) =>
      this.decifrar({
        ...t,
        cobradaEm: t.cobradaEm ? new Date(t.cobradaEm).toISOString() : null,
      }),
    );
  }

  /** Ciclos da inscrição, do mais recente ao mais antigo, com as tarefas de cada um. */
  async daInscricao(tx: Tx, inscricaoId: string, hoje: string): Promise<CicloDTO[]> {
    const ciclos = await tx.execute<LinhaCiclo>(sql`
      select c.id, c.version, c.numero, p.titulo, p.link_material as "linkMaterial",
        to_char(c.enviado_em, 'YYYY-MM-DD') as "enviadoEm", to_char(c.prazo, 'YYYY-MM-DD') as prazo,
        to_char(c.concluido_em, 'YYYY-MM-DD') as "concluidoEm",
        to_char(c.nao_concluido_em, 'YYYY-MM-DD') as "naoConcluidoEm",
        c.anterior_ao_sistema as "anteriorAoSistema",
        mentoria_ciclo_status(c.concluido_em, c.nao_concluido_em, c.prazo, ${hoje}::date) as status,
        case when c.concluido_em is null and c.nao_concluido_em is null
          then greatest(${hoje}::date - c.prazo, 0) else 0 end as "diasAtraso",
        mentoria_pct_tarefas(c.id) as "pctTarefas"
      from mentoria_ciclos c left join mentoria_pmes p on p.id = c.pme_id
      where c.inscricao_id = ${inscricaoId}::uuid
      order by c.numero desc`);
    if (!ciclos.length) return [];
    const tarefas = await this.tarefas(
      tx,
      sql`t.ciclo_id in (select id from mentoria_ciclos where inscricao_id = ${inscricaoId}::uuid)`,
    );
    return ciclos.map((c) => ({ ...c, tarefas: tarefas.filter((t) => t.cicloId === c.id) }));
  }

  /** Trava a inscrição para dois envios ao mesmo tempo e lê o que as regras precisam. */
  private async estado(tx: Tx, inscricaoId: string) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`mentoria_ciclos:${inscricaoId}`}))`,
    );
    const [i] = await tx.execute<{
      status: string;
      termino: string | null;
      ultimo: number | null;
      ultimo_envio: string | null;
      aberto: string | null;
      aberto_numero: number | null;
    }>(sql`
      select i.status, to_char(i.termino_previsto, 'YYYY-MM-DD') as termino,
        (select max(c.numero) from mentoria_ciclos c where c.inscricao_id = i.id) as ultimo,
        (select to_char(max(c.enviado_em), 'YYYY-MM-DD') from mentoria_ciclos c
         where c.inscricao_id = i.id) as ultimo_envio,
        a.id as aberto, a.numero as aberto_numero
      from mentoria_inscricoes i
      left join mentoria_ciclos a on a.inscricao_id = i.id
        and a.concluido_em is null and a.nao_concluido_em is null
      where i.id = ${inscricaoId}::uuid`);
    if (!i) throw new NotFoundException();
    return i;
  }

  private validarData(data: string, hoje: string, ultimoEnvio: string | null) {
    if (data > hoje) throw new BadRequestException('A data de envio não pode ser no futuro');
    if (ultimoEnvio && data < ultimoEnvio)
      throw new BadRequestException('A data de envio não pode ser antes do PME anterior');
  }

  /** O ciclo aberto vira não concluído quando a equipe registra o seguinte (§3, P3). */
  private async fecharAberto(tx: Tx, abertoId: string | null, data: string) {
    if (!abertoId) return;
    await tx
      .update(mentoriaCiclos)
      .set({
        naoConcluidoEm: data,
        version: sql`${mentoriaCiclos.version} + 1`,
        atualizadoEm: sql`now()`,
      })
      .where(eq(mentoriaCiclos.id, abertoId));
  }

  /**
   * Envio do próximo PME (§3): ciclo do número seguinte com uma tarefa por atividade extra e a de
   * encerramento, todas com o prazo do ciclo. O 1º também preenche `pme1_enviado_em`.
   */
  async enviarNaTx(tx: Tx, inscricaoId: string, hoje: string, enviadoEm?: string) {
    await exigirEdicao(tx, 'PME', inscricaoId);
    const i = await this.estado(tx, inscricaoId);
    if (i.status !== 'ATIVO') throw new BadRequestException('Só mentorado ativo recebe PME');
    if (i.termino && hoje > i.termino) throw new BadRequestException('A jornada já terminou');
    const numero = (i.ultimo ?? 0) + 1;
    if (numero > ULTIMO_PME) throw new BadRequestException('Os 12 PMEs já foram enviados');
    const data = enviadoEm ?? hoje;
    this.validarData(data, hoje, i.ultimo_envio);
    const [pme] = await tx.execute<{ id: string; extras: string[]; encerramento: string | null }>(
      sql`select id, atividades_extras as extras, encerramento from mentoria_pmes
        where numero = ${numero} and ativo`,
    );
    if (!pme) throw new BadRequestException(`Cadastre o ${numero}º PME em Configurações`);

    await this.fecharAberto(tx, i.aberto, data);
    const [c] = await tx
      .insert(mentoriaCiclos)
      .values({ inscricaoId, pmeId: pme.id, numero, enviadoEm: data })
      .returning({ id: mentoriaCiclos.id, prazo: mentoriaCiclos.prazo });
    const textos = [
      ...pme.extras.map((d) => ({ origem: 'EXTRA' as const, d })),
      { origem: 'ENCERRAMENTO' as const, d: pme.encerramento ?? encerramentoPadrao(numero) },
    ];
    await tx.insert(mentoriaTarefas).values(
      textos.map((x, ordem) => {
        const id = randomUUID();
        return {
          id,
          inscricaoId,
          origem: x.origem,
          cicloId: c!.id,
          ordem,
          descricao: this.crypto.cifrarTexto(x.d, aad('mentoria_tarefas', 'descricao', id)),
          prazo: c!.prazo,
        };
      }),
    );
    if (numero === 1)
      await tx.execute(sql`update mentoria_inscricoes set pme1_enviado_em = coalesce(
          pme1_enviado_em, ${data}::date::timestamp at time zone 'America/Sao_Paulo'),
          atualizado_em = now()
        where id = ${inscricaoId}::uuid`);
    await registrarHistorico(tx, inscricaoId, 'pme.enviado', [
      `pme_${numero}`,
      ...(i.aberto_numero ? [`pme_${i.aberto_numero}_nao_concluido`] : []),
    ]);
    return c!.id;
  }

  private async um(tx: Tx, inscricaoId: string, cicloId: string): Promise<CicloDTO> {
    const ciclos = await this.daInscricao(tx, inscricaoId, this.hoje());
    const c = ciclos.find((x) => x.id === cicloId);
    if (!c) throw new NotFoundException();
    return c;
  }

  enviar(u: AuthUser, inscricaoId: string, b: EnvioPme): Promise<CicloDTO> {
    const hoje = this.hoje();
    return withUser(this.db, u.id, async (tx) => {
      const id = await this.enviarNaTx(tx, inscricaoId, hoje, b.enviadoEm);
      return this.um(tx, inscricaoId, id);
    }).catch((e) => erroDoBanco(e, 'Este PME já foi enviado'));
  }

  /** Carteira importada (§3): o ciclo em que o mentorado já estava, sem tarefas automáticas. */
  anterior(u: AuthUser, inscricaoId: string, b: CicloAnterior): Promise<CicloDTO> {
    const hoje = this.hoje();
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'PME', inscricaoId);
      const i = await this.estado(tx, inscricaoId);
      if (i.status !== 'ATIVO' && i.status !== 'PAUSADO')
        throw new BadRequestException('Só mentorado ativo ou pausado tem PME');
      if (i.ultimo !== null && b.numero <= i.ultimo)
        throw new BadRequestException('Este PME ou um seguinte já foi registrado');
      this.validarData(b.enviadoEm, hoje, i.ultimo_envio);
      if (b.concluidoEm && (b.concluidoEm < b.enviadoEm || b.concluidoEm > hoje))
        throw new BadRequestException('A conclusão fica entre o envio e hoje');
      const [pme] = await tx.execute<{ id: string }>(
        sql`select id from mentoria_pmes where numero = ${b.numero}`,
      );
      await this.fecharAberto(tx, i.aberto, b.enviadoEm);
      const [c] = await tx
        .insert(mentoriaCiclos)
        .values({
          inscricaoId,
          pmeId: pme?.id ?? null,
          numero: b.numero,
          enviadoEm: b.enviadoEm,
          concluidoEm: b.concluidoEm ?? null,
          anteriorAoSistema: true,
        })
        .returning({ id: mentoriaCiclos.id });
      await registrarHistorico(tx, inscricaoId, 'pme.anterior', [`pme_${b.numero}`]);
      return this.um(tx, inscricaoId, c!.id);
    }).catch((e) => erroDoBanco(e, 'Este PME já foi registrado'));
  }

  /** Corrige a data de envio (área PME) ou fecha/reabre à mão o ciclo sem encerramento (TAREFA). */
  atualizarCiclo(u: AuthUser, id: string, b: CicloPatch): Promise<CicloDTO> {
    const hoje = this.hoje();
    return withUser(this.db, u.id, async (tx) => {
      const [c] = await tx.select().from(mentoriaCiclos).where(eq(mentoriaCiclos.id, id));
      if (!c) throw new NotFoundException();
      const campos: string[] = [];
      if (b.enviadoEm !== undefined) {
        await exigirEdicao(tx, 'PME', c.inscricaoId);
        const [viz] = await tx.execute<{ antes: string | null; depois: string | null }>(sql`
          select (select to_char(max(enviado_em), 'YYYY-MM-DD') from mentoria_ciclos
                  where inscricao_id = ${c.inscricaoId}::uuid and numero < ${c.numero}) as antes,
                 (select to_char(min(enviado_em), 'YYYY-MM-DD') from mentoria_ciclos
                  where inscricao_id = ${c.inscricaoId}::uuid and numero > ${c.numero}) as depois`);
        this.validarData(b.enviadoEm, hoje, viz?.antes ?? null);
        if (viz?.depois && b.enviadoEm > viz.depois)
          throw new BadRequestException('A data de envio não pode ser depois do PME seguinte');
        if (c.concluidoEm && b.enviadoEm > c.concluidoEm)
          throw new BadRequestException('A data de envio não pode ser depois da conclusão');
        campos.push('enviadoEm');
      }
      if (b.concluidoEm !== undefined) {
        await exigirEdicao(tx, 'TAREFA', c.inscricaoId);
        const envio = b.enviadoEm ?? c.enviadoEm;
        if (b.concluidoEm && (b.concluidoEm < envio || b.concluidoEm > hoje))
          throw new BadRequestException('A conclusão fica entre o envio e hoje');
        if (!b.concluidoEm) {
          const [seguinte] = await tx.execute<{ n: number }>(sql`
            select 1 as n from mentoria_ciclos
            where inscricao_id = ${c.inscricaoId}::uuid and numero > ${c.numero} limit 1`);
          if (seguinte) throw new BadRequestException('O PME seguinte já foi enviado');
        }
        campos.push('concluidoEm');
      }
      if (!campos.length) throw new BadRequestException('Nada para alterar');
      const [r] = await tx
        .update(mentoriaCiclos)
        .set({
          ...(b.enviadoEm !== undefined ? { enviadoEm: b.enviadoEm } : {}),
          ...(b.concluidoEm !== undefined ? { concluidoEm: b.concluidoEm } : {}),
          version: sql`${mentoriaCiclos.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(and(eq(mentoriaCiclos.id, id), eq(mentoriaCiclos.version, b.version)))
        .returning({ id: mentoriaCiclos.id });
      if (!r) throw conflitoDeVersao();
      await registrarHistorico(tx, c.inscricaoId, 'pme.editado', [`pme_${c.numero}`, ...campos]);
      return this.um(tx, c.inscricaoId, id);
    }).catch((e) => erroDoBanco(e));
  }

  abrirTarefa(u: AuthUser, id: string): Promise<TarefaDTO> {
    return withUser(this.db, u.id, async (tx) => {
      const [t] = await this.tarefas(tx, sql`t.id = ${id}::uuid`);
      if (!t) throw new NotFoundException();
      return t;
    });
  }

  /** A meta escolhida é da inscrição e visível a quem combina (a Especialista não escolhe meta). */
  private async validarMeta(tx: Tx, inscricaoId: string, metaId: string) {
    const [m] = await tx.execute<{ id: string }>(sql`
      select id from mentoria_metas
      where id = ${metaId}::uuid and inscricao_id = ${inscricaoId}::uuid`);
    if (!m) throw new BadRequestException('Meta não encontrada');
  }

  /**
   * Tarefa da semana combinada na reunião (§4): até 3 (gatilho), prazo obrigatório, no ciclo aberto
   * se houver. Quem marca tarefas combina; a Especialista, só nas reuniões dela.
   */
  criarTarefa(u: AuthUser, reuniaoId: string, b: TarefaCriar): Promise<TarefaDTO> {
    const id = randomUUID();
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ inscricao_id: string; ok: boolean }>(sql`
        select r.inscricao_id, mentoria_edita_tarefa(r.id, r.inscricao_id) as ok
        from mentoria_reunioes r where r.id = ${reuniaoId}::uuid`);
      if (!r?.ok) throw new NotFoundException();
      if (b.metaId) await this.validarMeta(tx, r.inscricao_id, b.metaId);
      await tx.execute(sql`
        insert into mentoria_tarefas (id, inscricao_id, origem, reuniao_id, ciclo_id, meta_id,
          ordem, descricao, prazo)
        values (${id}::uuid, ${r.inscricao_id}::uuid, 'REUNIAO', ${reuniaoId}::uuid,
          (select c.id from mentoria_ciclos c where c.inscricao_id = ${r.inscricao_id}::uuid
            and c.concluido_em is null and c.nao_concluido_em is null),
          ${b.metaId ?? null}::uuid,
          (select coalesce(max(x.ordem) + 1, 0) from mentoria_tarefas x
            where x.reuniao_id = ${reuniaoId}::uuid and x.origem = 'REUNIAO'),
          ${this.crypto.cifrarTexto(b.descricao, aad('mentoria_tarefas', 'descricao', id))},
          ${b.prazo}::date)`);
      await registrarHistorico(tx, r.inscricao_id, 'tarefa.criada', [
        'tarefa_reuniao',
        'descricao',
        'prazo',
        ...(b.metaId ? ['meta'] : []),
      ]);
      const [t] = await this.tarefas(tx, sql`t.id = ${id}::uuid`);
      return t!;
    }).catch((e) => erroDoBanco(e));
  }

  /**
   * "Fiz" lançado pela equipe (E8): resultado e motivo. O comprovante vai pela rota de mídia. Na
   * tarefa da reunião, também texto, prazo e meta.
   */
  atualizarTarefa(u: AuthUser, id: string, b: TarefaPatch): Promise<{ version: number }> {
    return withUser(this.db, u.id, async (tx) => {
      const [t] = await tx.select().from(mentoriaTarefas).where(eq(mentoriaTarefas.id, id));
      if (!t) throw new NotFoundException();
      const [q] = await tx.execute<{ ok: boolean }>(
        sql`select mentoria_edita_tarefa(${t.reuniaoId}::uuid, ${t.inscricaoId}::uuid) as ok`,
      );
      if (!q?.ok) throw new NotFoundException();
      const mudaCombinado =
        b.descricao !== undefined || b.prazo !== undefined || b.metaId !== undefined;
      if (mudaCombinado && t.origem !== 'REUNIAO')
        throw new BadRequestException('Só a tarefa da reunião muda texto, prazo e meta');
      if (b.metaId) await this.validarMeta(tx, t.inscricaoId, b.metaId);
      const combinado = {
        ...(b.descricao !== undefined
          ? {
              descricao: this.crypto.cifrarTexto(
                b.descricao,
                aad('mentoria_tarefas', 'descricao', id),
              ),
            }
          : {}),
        ...(b.prazo !== undefined ? { prazo: b.prazo } : {}),
        ...(b.metaId !== undefined ? { metaId: b.metaId } : {}),
      };
      const status = (b.status ?? t.status) as TarefaStatus;
      const pede = tarefaPedeMotivo(status);
      if (!pede && b.motivo)
        throw new BadRequestException('O motivo é só para tarefa parcial ou não feita');
      const motivo = !pede
        ? { motivo: null }
        : b.motivo !== undefined
          ? { motivo: this.crypto.cifrarOpcional(b.motivo, aad('mentoria_tarefas', 'motivo', id)) }
          : {};
      const [r] = await tx
        .update(mentoriaTarefas)
        .set({
          status,
          ...motivo,
          ...combinado,
          version: sql`${mentoriaTarefas.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(and(eq(mentoriaTarefas.id, id), eq(mentoriaTarefas.version, b.version)))
        .returning({ version: mentoriaTarefas.version });
      if (!r) throw conflitoDeVersao();
      const mudou = status !== t.status;
      await registrarHistorico(tx, t.inscricaoId, mudou ? 'tarefa.marcada' : 'tarefa.editada', [
        `tarefa_${t.origem.toLowerCase()}`,
        ...(mudou ? ['status'] : []),
        ...(b.motivo !== undefined || (mudou && !pede && t.motivo) ? ['motivo'] : []),
        ...Object.keys(combinado).map((k) => (k === 'metaId' ? 'meta' : k)),
      ]);
      return r;
    }).catch((e) => erroDoBanco(e));
  }
}
