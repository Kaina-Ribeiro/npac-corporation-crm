import { sql } from 'drizzle-orm';
import { bigserial, customType, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

const inet = customType<{ data: string }>({ dataType: () => 'inet' });

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  data: jsonb('data')
    .notNull()
    .default(sql`'{}'::jsonb`),
});
