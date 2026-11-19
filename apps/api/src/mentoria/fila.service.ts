import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { withUser, type Db, type Tx } from '@npac/db';
import {
  DEGRAUS_ATRASO,
  FILA_FEITO_MANUAL,
  escopoPadrao,
  itemVisivel,
  type AuthUser,
  type DegrauAtraso,
  type Etapa,
  type EtapaStatus,
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
  type SemaforoCor,
  type SemaforoMotivo,
  type TarefaOrigem,
  type TarefaStatus,
  type TipoInscricao,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { erroDoBanco } from './erros.js';
import { CiclosService } from './ciclos.service.js';
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

/** O degrau sai da chave do item (`pme-atrasado:<ciclo>:<prazo atual>:<degrau>`). */
function degrauDaChave(chave: string): DegrauAtraso | null {
  const n = Number(chave.split(':').at(-1));
  return (DEGRAUS_ATRASO as readonly number[]).includes(n) ? (n as DegrauAtraso) : null;
}

function cicloDoItem(
  i: FilaItemBase,
  porCiclo: Map<string, { numero: number; prazoAtual: string; diasAtraso: number }>,
): FilaItemDTO['ciclo'] {
  if ((i.tipo !== 'ENVIAR_PME' && i.tipo !== 'PME_ATRASADO') || !i.referenciaId) return null;
  const c = porCiclo.get(i.referenciaId);
  if (!c) return null;
  return { ...c, degrau: i.tipo === 'PME_ATRASADO' ? degrauDaChave(i.chave) : null };
}

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
    private readonly ciclos: CiclosService,
  ) {}

  agora(): Date {
    return new Date(this.clock.now());
  }

  private async eu(tx: Tx, id: string): Promise<FilaEu & { soCarteira: boolean }> {
    const [r] = await tx.execute<{ perfil: Perfil | null; admin: boolean; so_carteira: boolean }>(
      sql`select mentoria_perfil() as perfil, mentoria_admin() as admin,
        mentoria_so_carteira() as so_carteira`,
    );
    return {
      id,
      perfil: r?.perfil ?? null,
      admin: r?.admin === true,
      soCarteira: r?.so_carteira === true,
    };
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
      // "Só a carteira" (Fase 3B, b): só a Minha fila.
      const escopo = eu.soCarteira ? 'MINHA' : (filtro.escopo ?? escopoPadrao(eu));
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
    const tarefas = ids((i) => i.referenciaId, ['COBRANCA']);
    const ciclos = ids((i) => i.referenciaId, ['ENVIAR_PME', 'PME_ATRASADO']);
    const semaforos = ids((i) => i.inscricaoId, ['SEMAFORO']);
    const hoje = this.ciclos.hoje();

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

    const porEtapa = new Map<string, FilaItemDTO['etapa']>();
    if (etapas.length) {
      const linhas = await tx.execute<{
        id: string;
        etapa: Etapa;
        status: EtapaStatus;
        version: number;
      }>(sql`select id, etapa, status, version from mentoria_onboarding_etapas
          where id = any(${sql.param(etapas)}::uuid[])`);
      for (const l of linhas)
        porEtapa.set(l.id, { nome: l.etapa, status: l.status, version: l.version });
    }

    const porTarefa = new Map<string, FilaItemDTO['tarefa']>();
    if (tarefas.length) {
      const linhas = await tx.execute<{
        id: string;
        descricao: string | null;
        status: TarefaStatus;
        origem: TarefaOrigem;
        prazo: string;
        ciclo: number | null;
        version: number;
      }>(sql`
        select t.id, t.descricao, t.status, t.origem, to_char(t.prazo, 'YYYY-MM-DD') as prazo,
          c.numero as ciclo, t.version
        from mentoria_tarefas t left join mentoria_ciclos c on c.id = t.ciclo_id
        where t.id = any(${sql.param(tarefas)}::uuid[])`);
      for (const l of linhas)
        porTarefa.set(l.id, {
          descricao: this.crypto.decifrarOpcional(
            l.descricao,
            aad('mentoria_tarefas', 'descricao', l.id),
          ),
          status: l.status,
          origem: l.origem,
          prazo: l.prazo,
          cicloNumero: l.ciclo,
          version: l.version,
        });
    }

    const porCiclo = new Map<string, { numero: number; prazoAtual: string; diasAtraso: number }>();
    if (ciclos.length) {
      const linhas = await tx.execute<{
        id: string;
        numero: number;
        prazo_atual: string;
        atraso: number;
      }>(sql`
        select id, numero, to_char(coalesce(segunda_chance_ate, prazo), 'YYYY-MM-DD') as prazo_atual,
          greatest(${hoje}::date - coalesce(segunda_chance_ate, prazo), 0) as atraso
        from mentoria_ciclos where id = any(${sql.param(ciclos)}::uuid[])`);
      for (const l of linhas)
        porCiclo.set(l.id, { numero: l.numero, prazoAtual: l.prazo_atual, diasAtraso: l.atraso });
    }

    const porSemaforo = new Map<string, NonNullable<FilaItemDTO['semaforo']>>();
    if (semaforos.length) {
      const linhas = await tx.execute<{
        inscricao_id: string;
        cor: SemaforoCor;
        motivos: SemaforoMotivo[];
      }>(sql`
        select inscricao_id, cor, motivos from mentoria_semaforo_lote(${hoje}::date)
        where inscricao_id = any(${sql.param(semaforos)}::uuid[])`);
      for (const l of linhas) porSemaforo.set(l.inscricao_id, { cor: l.cor, motivos: l.motivos });
    }

    const pessoasIds = ids((i) => i.responsavelId);
    const nomes = new Map<string, string>();
    if (pessoasIds.length) {
      const linhas = await tx.execute<{ id: string; name: string }>(
        sql`select id, name from "user" where id = any(${sql.param(pessoasIds)}::text[])`,
      );
      for (const l of linhas) nomes.set(l.id, l.name);
    }

    return base.map((i) => ({
      ...i,
      responsavelNome: i.responsavelId ? (nomes.get(i.responsavelId) ?? null) : null,
      mentorado: i.inscricaoId ? (mentorados.get(i.inscricaoId) ?? null) : null,
      etapa: i.referenciaId ? (porEtapa.get(i.referenciaId) ?? null) : null,
      reuniao: i.referenciaId ? (porReuniao.get(i.referenciaId) ?? null) : null,
      acao: i.referenciaId ? (porAcao.get(i.referenciaId) ?? null) : null,
      tarefa:
        i.tipo === 'COBRANCA' && i.referenciaId ? (porTarefa.get(i.referenciaId) ?? null) : null,
      semaforo:
        i.tipo === 'SEMAFORO' && i.inscricaoId ? (porSemaforo.get(i.inscricaoId) ?? null) : null,
      ciclo: cicloDoItem(i, porCiclo),
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

  /**
   * Marcar o 1º PME enviado na Fila também abre o ciclo 1 (Fase 2), se a inscrição está ativa,
   * sem ciclo e com o 1º PME ativo no catálogo, e se quem marca registra envios. Senão fica só a
   * data, como na Fase 1.
   */
  private async cicloDoPme1(tx: Tx, inscricaoId: string) {
    const [ok] = await tx.execute<{ ok: boolean }>(sql`
      select mentoria_edita('PME', i.id) and i.status = 'ATIVO'
        and not exists (select 1 from mentoria_ciclos c where c.inscricao_id = i.id)
        and exists (select 1 from mentoria_pmes p where p.numero = 1 and p.ativo) as ok
      from mentoria_inscricoes i where i.id = ${inscricaoId}::uuid`);
    if (ok?.ok) await this.ciclos.enviarNaTx(tx, inscricaoId, this.ciclos.hoje());
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
      if (enviado) await this.cicloDoPme1(tx, inscricaoId);
      return { pme1EnviadoEm: r.em ? iso(r.em) : null };
    }).catch((e) => erroDoBanco(e));
  }
}
