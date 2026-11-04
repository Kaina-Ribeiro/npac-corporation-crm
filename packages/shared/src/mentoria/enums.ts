/** Status do mentorado (lista fixa do PDF, Módulo 1): muda a cor da linha no Dashboard. */
export const MENTORADO_STATUS = ['ENGAJADO', 'EM_ATENCAO', 'EM_RISCO'] as const;
export type MentoradoStatus = (typeof MENTORADO_STATUS)[number];

export const MENTORADO_STATUS_LABEL: Record<MentoradoStatus, string> = {
  ENGAJADO: 'Engajado',
  EM_ATENCAO: 'Em atenção',
  EM_RISCO: 'Em risco',
};
