import type { IncomeBand, LeadSource, StageKey, Tier } from './enums.js';

/** Lead como a API devolve (telefone já decifrado; só para quem pode ver o lead). */
export type LeadDTO = {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  incomeBand: IncomeBand;
  source: LeadSource;
  /** Texto de quando a origem é "Outro". */
  sourceOther: string | null;
  tier: Tier;
  stageKey: StageKey;
  sdr: { id: string; name: string };
  closer: { id: string; name: string } | null;
  nextContactAt: string | null;
  summary: string | null;
  version: number;
  createdAt: string;
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export type LeadCatalog = {
  /** `system`: coluna com regra de negócio (renomeia e reordena, não exclui). */
  stages: { id: string; key: StageKey; label: string; position: number; system: boolean }[];
  team: {
    id: string;
    name: string;
    role: import('./enums.js').Role;
    canProspect: boolean;
    canClose: boolean;
  }[];
};
export type LeadActivityDTO = {
  notes: { id: string; body: string; createdBy: string; version: number; createdAt: string }[];
  tasks: {
    id: string;
    title: string;
    dueAt: string | null;
    completedAt: string | null;
    assigneeId: string;
    version: number;
  }[];
  timeline: { id: string; kind: string; actorId: string; fields: string[]; at: string }[];
};
export type MeetingDTO = {
  id: string;
  leadId: string;
  closerId: string;
  scheduledAt: string;
  origin: import('./enums.js').MeetingOrigin;
  outcome: import('./enums.js').MeetingOutcome | null;
  canceledAt: string | null;
  version: number;
  /** Etapas de confirmação ("Confirmação enviada") feitas no horário atual. */
  confirmations: import('./reminders.js').ReminderStepConfirm[];
};
export type PipelineLead = Pick<
  LeadDTO,
  'id' | 'name' | 'tier' | 'stageKey' | 'version' | 'nextContactAt'
>;
export type PipelineDTO = {
  stage: LeadCatalog['stages'][number];
  items: PipelineLead[];
  total: number;
  page: number;
}[];

/** Caixa de avisos da pessoa logada. */
export type NotificationsDTO = {
  unread: number;
  /** Follow-ups atrasados dos leads em que a pessoa é SDR. */
  overdue: number;
  items: {
    id: string;
    at: string;
    read: boolean;
    kind: string;
    actorName: string;
    leadId: string;
    leadName: string | null;
  }[];
  /** Reuniões da pessoa como closer nas próximas 2 horas. */
  soon: { id: string; at: string; leadId: string; leadName: string }[];
  /** Mensagens não lidas do chat (soma dos canais da pessoa). */
  chatUnread: number;
  /**
   * Reuniões das próximas 2 h em que a pessoa é dona do lead. A etapa vigente (1 h, 15 min,
   * 1 min) é calculada no navegador, pelo relógio, como os atrasados do Hoje.
   */
  reminders: {
    id: string;
    at: string;
    leadId: string;
    leadName: string;
    confirmed: import('./reminders.js').ReminderStepConfirm[];
  }[];
};

/** Filtro salvo da lista de leads (só critérios). */
export type SavedViewDTO = { id: string; name: string; filters: Record<string, string> };
