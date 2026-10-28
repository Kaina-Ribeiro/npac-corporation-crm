import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { leads } from './leads.js';

/** Pedidos do titular (acesso, correção, eliminação) com prazo legal acompanhado. */
export const lgpdRequests = pgTable(
  'lgpd_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('OPEN'),
    leadId: uuid('lead_id').references(() => leads.id),
    description: text('description').notNull(),
    resolution: text('resolution'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp('due_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '15 days'`),
    resolvedBy: text('resolved_by').references(() => user.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    check('lgpd_kind', sql`${t.kind} in ('ACCESS','CORRECTION','DELETION')`),
    check('lgpd_status', sql`${t.status} in ('OPEN','DONE','REJECTED')`),
    check(
      'lgpd_resolution_pair',
      sql`(${t.status} = 'OPEN') = (${t.resolvedAt} is null) and (${t.resolvedAt} is null) = (${t.resolvedBy} is null)`,
    ),
    check('lgpd_lengths', sql`char_length(${t.description}) between 1 and 2000`),
    index('lgpd_status_idx').on(t.status, t.dueAt),
  ],
);
