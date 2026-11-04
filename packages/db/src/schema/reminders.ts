import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { meetings } from './meetings.js';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** Inscrição de Web Push de um aparelho; chaves cifradas (AES-256-GCM) pela API. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: bytea('p256dh').notNull(),
    auth: bytea('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

/** "Confirmação enviada" de uma etapa, valendo para o horário da reunião naquele momento. */
export const meetingConfirmations = pgTable(
  'meeting_confirmations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('meeting_confirmations_once').on(t.meetingId, t.step, t.scheduledAt),
    check('meeting_confirmations_step', sql`${t.step} in ('H1','M15')`),
  ],
);

/** Etapas de lembrete já disparadas (uma vez por reunião, etapa e horário). */
export const meetingRemindersSent = pgTable(
  'meeting_reminders_sent',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.step, t.scheduledAt] }),
    check('meeting_reminders_step', sql`${t.step} in ('H1','M15','M1')`),
  ],
);
