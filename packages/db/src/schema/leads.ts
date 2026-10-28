import { sql } from 'drizzle-orm';
import {
  customType,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { incomeBandEnum, leadSourceEnum, legalBasisEnum, tierEnum } from './enums.js';
import { pipelineStages } from './pipeline.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phoneEnc: bytea('phone_enc'),
    phoneBidx: text('phone_bidx'),
    instagram: text('instagram'),
    incomeBand: incomeBandEnum('income_band').notNull(),
    source: leadSourceEnum('source').notNull(),
    tier: tierEnum('tier').notNull(),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id),
    sdrId: text('sdr_id')
      .notNull()
      .references(() => user.id),
    closerId: text('closer_id').references(() => user.id),
    nextContactAt: timestamp('next_contact_at', { withTimezone: true }),
    summary: text('summary'),
    legalBasis: legalBasisEnum('legal_basis').notNull().default('LEGITIMATE_INTEREST'),
    retentionUntil: date('retention_until'),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  },
  (t) => [
    index('leads_sdr_id_idx').on(t.sdrId),
    index('leads_closer_id_idx').on(t.closerId),
    index('leads_next_contact_at_idx').on(t.nextContactAt),
    index('leads_phone_bidx_idx').on(t.phoneBidx),
    index('leads_instagram_idx').on(t.instagram),
    index('leads_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);
