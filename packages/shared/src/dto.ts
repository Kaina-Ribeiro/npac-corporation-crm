import type { IncomeBand, LeadSource, StageKey, Tier } from './enums.js';

/** Lead como a API devolve (telefone já decifrado; só para quem pode ver o lead). */
export type LeadDTO = {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  incomeBand: IncomeBand;
  source: LeadSource;
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
  stages: { id: string; key: StageKey; label: string; position: number }[];
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
