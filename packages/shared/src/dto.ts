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
