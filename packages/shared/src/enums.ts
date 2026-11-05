/**
 * Hierarquia comercial: Diretoria > Head > SDR / Closer. ACOMPANHAMENTO é a equipe de mentoria:
 * só vê o módulo Acompanhamento e não faz parte da hierarquia comercial.
 */
export const ROLES = ['DIRETOR', 'HEAD', 'SDR', 'CLOSER', 'ACOMPANHAMENTO'] as const;
export type Role = (typeof ROLES)[number];

/** Liderança: vê toda a equipe e administra. Só a Diretoria dá ou tira cargo de liderança. */
export const LEADER_ROLES: readonly Role[] = ['DIRETOR', 'HEAD'];
export const isLeader = (role: Role) => LEADER_ROLES.includes(role);
/**
 * MFA (TOTP) DESLIGADO por pedido do Gabriel (05/11/2026: "deixa isso pra depois"). Sem pedir código
 * no login, sem exigir no Acompanhamento (D18) e sem a tela do autenticador. Os autenticadores já
 * cadastrados ficam guardados: religar = `true` aqui (API e web leem esta chave).
 */
export const MFA_LIGADO = false as boolean;
/** Quem usa o CRM comercial (leads, equipe, chat, avisos…). O Acompanhamento só vê o módulo. */
export const hasCommercialAccess = (role: Role) => role !== 'ACOMPANHAMENTO';

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

/**
 * Perfil que a faixa de renda define (pedido do cliente, 05/11/2026): 5–8 mil = P2, 8–15 mil = P1,
 * 15 mil para cima = P0. O formulário troca o perfil ao escolher a faixa; dá para ajustar à mão.
 */
export const TIER_BY_INCOME_BAND: Record<IncomeBand, Tier> = {
  R5_8K: 'P2',
  R8_15K: 'P1',
  R15_50K: 'P0',
  R50K_PLUS: 'P0',
};

/**
 * Origens que o cadastro oferece, na ordem da lista do cliente (05/11/2026). "Outro" pede o texto
 * em `sourceOther`.
 */
export const LEAD_SOURCE_OPTIONS = [
  'AUDIO_AUTOMACAO',
  'AUTOMACAO_COMENTARIOS',
  'LEVANTADA_MAO_STORY',
  'CALCULADORA',
  'BIO',
  'NACAO',
  'EMAIL',
  'YOUTUBE',
  'CLUBE',
  'SALA_SECRETA',
  'FOLLOW',
  'ATIVACAO_STORIES',
  'ATIVACAO_COMENTARIOS',
  'DIRECT_INTERESSE',
  'DIRECT_FECHAR',
  'INDICACAO_DESAFIO_NACAO',
  'LISTA_DIAGNOSTICO_FINANCEIRO',
  'TIKTOK',
  'EVENTO',
  'LEVANTADA_MAO_AULA',
  'MAGIA_FIM_DE_MES',
  'PDF_6',
  'PDF_10',
  'FOLLOW_AULA',
  'SUPORTE',
  'INDICACAO',
  'OUTRO',
] as const;
/** Origens antigas: seguem nos leads já cadastrados, mas o cadastro não oferece mais. */
export const LEGACY_LEAD_SOURCES = ['INSTAGRAM', 'WHATSAPP'] as const;
/** Todas as origens válidas no banco (enum `lead_source`). */
export const LEAD_SOURCES = [...LEGACY_LEAD_SOURCES, ...LEAD_SOURCE_OPTIONS] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadSourceOption = (typeof LEAD_SOURCE_OPTIONS)[number];
export const isLegacyLeadSource = (s: LeadSource) =>
  (LEGACY_LEAD_SOURCES as readonly string[]).includes(s);

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  AUDIO_AUTOMACAO: 'Áudio / automação',
  AUTOMACAO_COMENTARIOS: 'Automação comentários',
  LEVANTADA_MAO_STORY: 'Levantada de mão story',
  CALCULADORA: 'Calculadora',
  BIO: 'BIO',
  NACAO: 'Nação',
  EMAIL: 'E-mail',
  YOUTUBE: 'YouTube',
  CLUBE: 'Clube',
  SALA_SECRETA: 'Sala Secreta',
  FOLLOW: 'Follow',
  ATIVACAO_STORIES: 'Ativação stories',
  ATIVACAO_COMENTARIOS: 'Ativação comentários',
  DIRECT_INTERESSE: 'Chamou no direct / interesse',
  DIRECT_FECHAR: 'Direct chamou para fechar',
  INDICACAO_DESAFIO_NACAO: 'Indicação Desafio da Nação',
  LISTA_DIAGNOSTICO_FINANCEIRO: 'Lista Diagnóstico Financeiro',
  TIKTOK: 'TikTok',
  EVENTO: 'Evento',
  LEVANTADA_MAO_AULA: 'Levantada de mão / Aula',
  MAGIA_FIM_DE_MES: 'MAGIA FIM DE MÊS',
  PDF_6: 'PDF 6',
  PDF_10: 'PDF 10',
  FOLLOW_AULA: 'Follow / Aula',
  SUPORTE: 'Suporte',
  INDICACAO: 'Indicação',
  OUTRO: 'Outro',
  INSTAGRAM: 'Instagram (antigo)',
  WHATSAPP: 'WhatsApp (antigo)',
};
/** Texto livre de "Outro". */
export const SOURCE_OTHER_MAX = 80;

/** Motivo do Sem Perfil (pedido do cliente, 05/11/2026). "Outro" pede o texto em `lostReasonOther`. */
export const LOST_REASONS = ['SEM_RENDA', 'SEM_INTERESSE', 'NAO_RESPONDEU', 'OUTRO'] as const;
export type LostReason = (typeof LOST_REASONS)[number];
export const LOST_REASON_LABELS: Record<LostReason, string> = {
  SEM_RENDA: 'Sem renda',
  SEM_INTERESSE: 'Sem interesse',
  NAO_RESPONDEU: 'Não respondeu',
  OUTRO: 'Outro',
};
/** Texto livre do motivo "Outro". */
export const LOST_REASON_OTHER_MAX = 80;

/** Agendados: a etapa pede a reunião (data e closer); a origem da reunião vem da etapa. */
export const MEETING_ORIGIN_BY_STAGE: Partial<Record<string, 'DIRETO' | 'FOLLOW'>> = {
  AGENDADO_DIRETO: 'DIRETO',
  AGENDADO_FOLLOW: 'FOLLOW',
};

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
/** Etapas com regra de negócio (não podem ser excluídas). */
export type SystemStageKey = (typeof STAGE_KEYS)[number];
/** Chave de etapa: as de sistema ou as criadas pela liderança (`C_` + 8 hex). */
export type StageKey = string;
export const STAGE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

export const MEETING_ORIGINS = ['DIRETO', 'FOLLOW'] as const;
export type MeetingOrigin = (typeof MEETING_ORIGINS)[number];

export const MEETING_OUTCOMES = ['DONE', 'NO_SHOW', 'RESCHEDULED'] as const;
export type MeetingOutcome = (typeof MEETING_OUTCOMES)[number];

export const LEGAL_BASES = ['LEGITIMATE_INTEREST', 'CONSENT', 'CONTRACT'] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];
