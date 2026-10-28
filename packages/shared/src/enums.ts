export const ROLES = ['HEAD', 'SDR', 'CLOSER'] as const;
export type Role = (typeof ROLES)[number];

export const TIERS = ['P0', 'P1', 'P2'] as const;
export type Tier = (typeof TIERS)[number];

export const INCOME_BANDS = ['R5_8K', 'R8_15K', 'R15_50K', 'R50K_PLUS'] as const;
export type IncomeBand = (typeof INCOME_BANDS)[number];

export const INCOME_BAND_LABELS: Record<IncomeBand, string> = {
  R5_8K: 'R$ 5–8 mil',
  R8_15K: 'R$ 8–15 mil',
  R15_50K: 'R$ 15–50 mil',
  R50K_PLUS: 'R$ 50 mil+',
};

export const LEAD_SOURCES = ['INSTAGRAM', 'WHATSAPP', 'INDICACAO', 'OUTRO'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const STAGE_KEYS = [
  'SONDAGEM',
  'AGENDADO_DIRETO',
  'EM_FOLLOW',
  'AGENDADO_FOLLOW',
  'AGENDOU_PAGAMENTO',
  'NO_SHOW',
  'VENDA',
  'PERDIDO',
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const MEETING_ORIGINS = ['DIRETO', 'FOLLOW'] as const;
export type MeetingOrigin = (typeof MEETING_ORIGINS)[number];

export const MEETING_OUTCOMES = ['DONE', 'NO_SHOW'] as const;
export type MeetingOutcome = (typeof MEETING_OUTCOMES)[number];

export const LEGAL_BASES = ['LEGITIMATE_INTEREST', 'CONSENT', 'CONTRACT'] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];
