/**
 * Ordem dos cards do dashboard. Fica num cookie por pessoa e aparelho (o servidor já renderiza
 * na ordem certa, sem "pulo" ao carregar) e guarda só IDs de cards: nada pessoal.
 */
export const DASH_CARDS = [
  'kpi-leads',
  'kpi-meetings',
  'kpi-sold',
  'kpi-received',
  'revenue',
  'funnel',
  'daily-leads',
  'tiers',
  'closers',
  'sdrs',
  'products',
  'feed',
] as const;
export type DashCardId = (typeof DASH_CARDS)[number];

/** Só no /dashboard: o cookie não viaja nas outras rotas. */
export const DASH_COOKIE_PATH = '/dashboard';

/** Nome do cookie da pessoa: hash curto do ID (FNV-1a), para não misturar contas no aparelho. */
export function dashCookieName(userId: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 0x01000193);
  return `npac_dash_${(h >>> 0).toString(36)}`;
}

export const serializeOrder = (order: readonly string[]) => order.join('.');

/**
 * Ordem salva aplicada aos cards disponíveis: ignora IDs desconhecidos ou repetidos e encaixa
 * cards novos logo depois do vizinho que os precede na ordem padrão.
 */
export function mergeOrder(saved: string | undefined, defaults: readonly string[]): string[] {
  const out = [...new Set((saved ?? '').split('.'))].filter((id) => defaults.includes(id));
  defaults.forEach((id, i) => {
    if (out.includes(id)) return;
    const prev = defaults
      .slice(0, i)
      .reverse()
      .find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id);
  });
  return out;
}
