import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { meetingOriginEnum, meetingOutcomeEnum } from './enums.js';
import { leads } from './leads.js';

export const meetings = pgTable('meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id),
  closerId: text('closer_id')
    .notNull()
    .references(() => user.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  origin: meetingOriginEnum('origin').notNull(),
  outcome: meetingOutcomeEnum('outcome'),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
