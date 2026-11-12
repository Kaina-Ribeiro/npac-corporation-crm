// Metas e tarefas da reunião (Fase 2, Parte 2, spec 2026-11-11 §3 e §4). Lógica pura, sem zod.

export const PILARES = ['FE', 'SAUDE', 'DINHEIRO', 'RELACIONAMENTOS'] as const;
export type Pilar = (typeof PILARES)[number];
export const PILAR_LABEL: Record<Pilar, string> = {
  FE: 'Fé',
  SAUDE: 'Saúde',
  DINHEIRO: 'Dinheiro',
  RELACIONAMENTOS: 'Relacionamentos',
};

/** Tarefas combinadas por reunião (§3): a 4ª dá 400 na API e no banco. */
export const MAX_TAREFAS_REUNIAO = 3;

/** "5 de 10 kg", "R$ 2.000 de 10.000" etc.: o texto do progresso de uma meta, sem cálculo. */
export function progressoMetaTexto(m: {
  valorAlvo: number | null;
  valorAtual: number | null;
  unidade: string | null;
}): string | null {
  if (m.valorAlvo === null) return null;
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const u = m.unidade ? ` ${m.unidade}` : '';
  return `${n(m.valorAtual ?? 0)} de ${n(m.valorAlvo)}${u}`;
}
