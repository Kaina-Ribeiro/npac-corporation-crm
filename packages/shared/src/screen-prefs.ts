/**
 * Filtros lembrados por tela (NPAC-46): regras puras de leitura e gravação do cookie de cada tela.
 * O valor do cookie é entrada não confiável: só passa chave conhecida com valor válido. Nunca texto
 * digitado (busca), nome ou contato. Sem zod: vai ao cliente.
 */
import type { LeadCatalog } from './dto.js';
import { FORM_LEAD_SOURCE, LEAD_SOURCE_OPTIONS, LEGACY_LEAD_SOURCES, TIERS } from './enums.js';

export type PrefRule = (value: string) => boolean;
export type PrefRules = Record<string, PrefRule>;

/** `chave=valor&…` → mapa (sem `URLSearchParams`: o pacote não tem tipos do DOM nem do Node). */
function parse(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of (raw ?? '').split('&')) {
    const at = pair.indexOf('=');
    if (at < 1) continue;
    try {
      const key = decodeURIComponent(pair.slice(0, at).replace(/\+/g, ' '));
      if (!out.has(key)) out.set(key, decodeURIComponent(pair.slice(at + 1).replace(/\+/g, ' ')));
    } catch {
      // Codificação inválida: o par é descartado.
    }
  }
  return out;
}

const stringify = (map: Map<string, string>) =>
  [...map].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/** Só as chaves de `rules` com valor aceito; o resto é descartado. */
export function readPrefs(raw: string | undefined, rules: PrefRules): Record<string, string> {
  const params = parse(raw);
  const out: Record<string, string> = {};
  for (const [key, rule] of Object.entries(rules)) {
    const value = params.get(key);
    if (value && rule(value)) out[key] = value;
  }
  return out;
}

/** `chave=valor&…` na ordem de `rules`, sem vazio nem valor recusado; tudo vazio dá ''. */
export function writePrefs(values: Record<string, string | undefined>, rules: PrefRules): string {
  const params = new Map<string, string>();
  for (const [key, rule] of Object.entries(rules)) {
    const value = values[key];
    if (value && rule(value)) params.set(key, value);
  }
  return stringify(params);
}

export const oneOf =
  (list: readonly string[]): PrefRule =>
  (value) =>
    list.includes(value);

export const isoDate: PrefRule = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** 'AAAA-MM-DD' do dia em Brasília. */
export const brasiliaDay = (at: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(at);

type Catalog = Pick<LeadCatalog, 'stages' | 'team'>;
const prospects = (c: Pick<LeadCatalog, 'team'>) =>
  c.team.filter((u) => u.canProspect).map((u) => u.id);
const closers = (c: Pick<LeadCatalog, 'team'>) => c.team.filter((u) => u.canClose).map((u) => u.id);
const SOURCES = [...LEAD_SOURCE_OPTIONS, ...LEGACY_LEAD_SOURCES, FORM_LEAD_SOURCE];

/** Ordem padrão da lista de leads: não é gravada. */
export const LEAD_FILTER_DEFAULTS = { sort: 'createdAt', direction: 'desc' } as const;

/** Filtros de Leads e Pipeline (os padrões de ordem não entram). */
export function leadFilterRules(c: Catalog): PrefRules {
  return {
    stage: oneOf(c.stages.map((s) => s.key)),
    tier: oneOf(TIERS),
    source: oneOf(SOURCES),
    sdrId: oneOf(prospects(c)),
    closerId: oneOf(closers(c)),
    period: oneOf(['TODAY', 'TOMORROW', 'WEEK', 'OVERDUE', 'NO_DATE', 'RANGE']),
    from: isoDate,
    to: isoDate,
    sort: oneOf(['nextContactAt', 'meetingAt', 'name']),
    direction: oneOf(['asc']),
  };
}

/** Intervalo só com as duas datas; datas só com intervalo (a API recusaria o resto). */
export function readLeadFilters(raw: string | undefined, c: Catalog): Record<string, string> {
  const { period, from, to, ...rest } = readPrefs(raw, leadFilterRules(c));
  if (period !== 'RANGE') return { ...rest, ...(period ? { period } : {}) };
  return from && to ? { ...rest, period, from, to } : rest;
}

/** Pipeline: os filtros de Leads + a coluna aberta no celular. */
export function pipelineRules(c: Catalog): PrefRules {
  return { ...leadFilterRules(c), col: oneOf(c.stages.map((s) => s.key)) };
}

export function readPipelinePrefs(raw: string | undefined, c: Catalog): Record<string, string> {
  return { ...readLeadFilters(raw, c), ...readPrefs(raw, { col: pipelineRules(c).col! }) };
}

/** Relatórios: os mesmos campos que o formulário mostra; mês até hoje é o padrão. */
export function reportRules(c: Catalog, productIds: readonly string[]): PrefRules {
  return {
    period: oneOf(['TODAY', 'RANGE']),
    from: isoDate,
    to: isoDate,
    sdrId: oneOf(prospects(c)),
    closerId: oneOf(closers(c)),
    stage: oneOf(c.stages.map((s) => s.key)),
    tier: oneOf(TIERS),
    source: oneOf(SOURCES),
    productId: oneOf(productIds),
  };
}

/** Dashboard: Hoje ou 7 dias (mês é o padrão); SDR só para a liderança, que vê o campo. */
export function dashboardRules(c: Pick<LeadCatalog, 'team'>, head: boolean): PrefRules {
  return {
    preset: oneOf(['TODAY', 'WEEK']),
    ...(head ? { sdrId: oneOf(prospects(c)) } : {}),
  };
}

/** Última URL de cada aba (telas com estado na URL). */
export type TabUrls = { last?: string; tabs: Record<string, string> };

/** Abas conhecidas; `daily` (semana, mês) só vale no mesmo dia de Brasília em que foi gravado. */
export function readTabUrls(
  raw: string | undefined,
  tabs: readonly string[],
  today: string,
  daily: readonly string[],
): TabUrls {
  const params = parse(raw);
  const stale = params.get('d') !== today;
  const out: TabUrls = { tabs: {} };
  for (const tab of tabs) {
    const query = params.get(tab);
    if (query === undefined) continue;
    const q = parse(query);
    if (stale) for (const key of daily) q.delete(key);
    out.tabs[tab] = stringify(q);
  }
  const last = params.get('last');
  if (last && last in out.tabs) out.last = last;
  return out;
}

/** Grava a consulta da aba, marca-a como a última e carimba o dia. */
export function writeTabUrls(saved: TabUrls, tab: string, query: string, today: string): string {
  const params = new Map(Object.entries({ ...saved.tabs, [tab]: query }));
  params.set('last', tab);
  params.set('d', today);
  return stringify(params);
}

/** Consulta canônica da aba: só as chaves da tela, na ordem dada, sem vazio. */
export function tabQuery(params: Record<string, string | undefined>, keys: readonly string[]) {
  const map = new Map<string, string>();
  for (const key of keys) {
    const value = params[key];
    if (value) map.set(key, value);
  }
  return stringify(map);
}

/**
 * Telas com estado na URL: com alguma chave da tela na URL, vale a URL (e vira a lembrada); sem
 * nenhuma (clique no menu), vale a última aba salva.
 */
export function pickTabUrl(
  url: Record<string, string | undefined>,
  keys: readonly string[],
  saved: TabUrls,
): { fromMenu: boolean; params: Record<string, string> } {
  const pick = (source: Map<string, string> | Record<string, string | undefined>) => {
    const out: Record<string, string> = {};
    for (const key of keys) {
      const value = source instanceof Map ? source.get(key) : source[key];
      if (value) out[key] = value;
    }
    return out;
  };
  if (keys.some((k) => url[k])) return { fromMenu: false, params: pick(url) };
  const query = saved.last ? saved.tabs[saved.last] : undefined;
  return { fromMenu: true, params: query ? pick(parse(query)) : {} };
}
