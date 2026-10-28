import {
  INCOME_BANDS,
  LEAD_SOURCES,
  LEGAL_BASES,
  MEETING_ORIGINS,
  MEETING_OUTCOMES,
  ROLES,
  STAGE_KEYS,
  TIERS,
} from '@npac/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ROLES);
export const tierEnum = pgEnum('tier', TIERS);
export const incomeBandEnum = pgEnum('income_band', INCOME_BANDS);
export const leadSourceEnum = pgEnum('lead_source', LEAD_SOURCES);
export const stageKeyEnum = pgEnum('stage_key', STAGE_KEYS);
export const meetingOriginEnum = pgEnum('meeting_origin', MEETING_ORIGINS);
export const meetingOutcomeEnum = pgEnum('meeting_outcome', MEETING_OUTCOMES);
export const legalBasisEnum = pgEnum('legal_basis', LEGAL_BASES);
