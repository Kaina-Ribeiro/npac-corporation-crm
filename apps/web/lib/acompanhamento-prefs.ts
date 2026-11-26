import {
  CICLO_STATUS,
  ETAPA_LABEL,
  FILA_GRUPOS,
  INSCRICAO_STATUS,
  SEMAFORO_CORES,
} from '@npac/shared/mentoria';
import { SITUACOES_RENOVACAO, type FiltroRenovacoes } from '@npac/shared/renovacoes';
import { oneOf, readPrefs, writePrefs, type PrefRules } from '@npac/shared/screen-prefs';
import { readPreference } from './read-preference';
import { rememberAt } from './screen-prefs';
import { userCookieName } from './user-cookie';

/**
 * Filtros lembrados do Acompanhamento (NPAC-46): o mesmo mecanismo de `lib/screen-prefs.ts`, com o
 * mapa das telas do módulo à parte para não pesar no JS do Comercial.
 */
export const AC_PREFS = {
  reunioes: { prefix: 'npac_f_ac_reun', path: '/acompanhamento/reunioes' },
  plano: { prefix: 'npac_f_ac_plano', path: '/acompanhamento/plano' },
  configuracoes: { prefix: 'npac_f_ac_conf', path: '/acompanhamento/configuracoes' },
  fila: { prefix: 'npac_f_ac_fila', path: '/acompanhamento/fila' },
  mentorados: { prefix: 'npac_f_ac_ment', path: '/acompanhamento/mentorados' },
  onboarding: { prefix: 'npac_f_ac_onb', path: '/acompanhamento/onboarding' },
  ficha: { prefix: 'npac_f_ac_ficha', path: '/acompanhamento/ficha' },
  pmes: { prefix: 'npac_f_ac_pmes', path: '/acompanhamento/pmes' },
  renovacoes: { prefix: 'npac_f_ac_renov', path: '/acompanhamento/renovacoes' },
} as const;

export type AcScreen = keyof typeof AC_PREFS;

export const acCookie = (screen: AcScreen, userId: string) =>
  userCookieName(AC_PREFS[screen].prefix, userId);

export const lembrarAc = (screen: AcScreen, cookie: string, value: string) =>
  rememberAt(AC_PREFS[screen].path, cookie, value);

/** Muda só as chaves de `patch` no cookie da tela (undefined apaga a chave). Só no navegador. */
export function atualizarAc(
  screen: AcScreen,
  cookie: string,
  regras: PrefRules,
  patch: Record<string, string | undefined>,
) {
  const atual = readPrefs(readPreference(cookie), regras);
  lembrarAc(screen, cookie, writePrefs({ ...atual, ...patch }, regras));
}

/** Fila: Minha/Equipe (a URL vence) e o grupo de itens; "Todos" é o padrão. */
export const FILA_REGRAS: PrefRules = {
  ver: oneOf(['minha', 'equipe']),
  grupo: oneOf(FILA_GRUPOS.map((g) => g.chave)),
};

/** Onboarding: etapa escolhida no funil e o painel (Funil é o padrão). */
export const ONBOARDING_REGRAS: PrefRules = {
  etapa: oneOf(Object.keys(ETAPA_LABEL)),
  painel: oneOf(['caixas', 'idrs']),
};

/** PMEs e ciclos (aba 7): número do PME e status do ciclo ("Sem PME" = nenhum enviado). */
export const PMES_REGRAS: PrefRules = {
  numero: oneOf(Array.from({ length: 12 }, (_, i) => String(i + 1))),
  status: oneOf([...CICLO_STATUS, 'SEM_PME']),
};

export type FiltroPmes = {
  numero?: number;
  status?: (typeof CICLO_STATUS)[number] | 'SEM_PME';
};
export const filtroDasPrefs = (p: Record<string, string>): FiltroPmes => ({
  ...(p.numero ? { numero: Number(p.numero) } : {}),
  ...(p.status ? { status: p.status as FiltroPmes['status'] } : {}),
});
export const prefsDoFiltro = (f: FiltroPmes) => ({
  numero: f.numero ? String(f.numero) : undefined,
  status: f.status,
});

/** Ficha: a aba (vale para qualquer mentorado) e o filtro do histórico ("Tudo" é o padrão). */
export const FICHA_REGRAS: PrefRules = {
  // `momento` só para ler cookie antigo: a aba saiu (NPAC-76) e `abaValida` a troca por `pessoas`.
  aba: oneOf(['inscricao', 'pessoas', 'momento', 'evolucao', 'cronograma', 'historico']),
  historico: oneOf(['REUNIOES', 'CONTATOS', 'ANOTACOES', 'ALTERACOES']),
  /** Aba Evolução: "Linha do tempo" (sem a chave, "Lado a lado"). */
  vista: oneOf(['linha']),
};

/** Mentorados: mês da jornada (o select vai de 1 a 12), status, responsável, semáforo e "completar". */
export type FiltrosMentorados = {
  mes?: number;
  status?: (typeof INSCRICAO_STATUS)[number];
  responsavelId?: string;
  semaforo?: (typeof SEMAFORO_CORES)[number];
  completar?: boolean;
};

export const mentoradosRegras = (responsaveis: readonly string[]): PrefRules => ({
  mes: oneOf(Array.from({ length: 12 }, (_, i) => String(i + 1))),
  status: oneOf(INSCRICAO_STATUS),
  responsavelId: oneOf(responsaveis),
  semaforo: oneOf(SEMAFORO_CORES),
  completar: oneOf(['1']),
});

export const filtrosParaPrefs = (f: FiltrosMentorados) => ({
  mes: f.mes ? String(f.mes) : undefined,
  status: f.status,
  responsavelId: f.responsavelId,
  semaforo: f.semaforo,
  completar: f.completar ? '1' : undefined,
});

export function prefsParaFiltros(p: Record<string, string>): FiltrosMentorados {
  return {
    ...(p.mes ? { mes: Number(p.mes) } : {}),
    ...(p.status ? { status: p.status as FiltrosMentorados['status'] } : {}),
    ...(p.responsavelId ? { responsavelId: p.responsavelId } : {}),
    ...(p.semaforo ? { semaforo: p.semaforo as FiltrosMentorados['semaforo'] } : {}),
    ...(p.completar ? { completar: true } : {}),
  };
}

/**
 * Renovações e gestão (NPAC-79): situação da conversa e responsável (só os que aparecem na lista; quem tem "só a
 * carteira" não tem o filtro de responsável e o cookie não o guarda).
 */
export const renovacoesRegras = (responsaveis: readonly string[]): PrefRules => ({
  situacao: oneOf(SITUACOES_RENOVACAO),
  responsavelId: oneOf(responsaveis),
});

export const filtroRenovacoesDasPrefs = (p: Record<string, string>): FiltroRenovacoes => ({
  ...(p.situacao ? { situacao: p.situacao as FiltroRenovacoes['situacao'] } : {}),
  ...(p.responsavelId ? { responsavelId: p.responsavelId } : {}),
});
