import {
  INCOME_BANDS,
  LEAD_SOURCES,
  LEGAL_BASES,
  LOST_REASONS,
  MEETING_ORIGINS,
  MEETING_OUTCOMES,
  ROLES,
  TIERS,
} from '@npac/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ROLES);
export const tierEnum = pgEnum('tier', TIERS);
export const incomeBandEnum = pgEnum('income_band', INCOME_BANDS);
export const leadSourceEnum = pgEnum('lead_source', LEAD_SOURCES);
export const meetingOriginEnum = pgEnum('meeting_origin', MEETING_ORIGINS);
export const meetingOutcomeEnum = pgEnum('meeting_outcome', MEETING_OUTCOMES);
export const legalBasisEnum = pgEnum('legal_basis', LEGAL_BASES);
export const leadLostReasonEnum = pgEnum('lead_lost_reason', LOST_REASONS);
