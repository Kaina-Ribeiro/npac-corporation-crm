import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { leads } from './leads.js';

export const leadNotes = pgTable(
  'lead_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    body: text('body').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lead_notes_lead_idx').on(t.leadId, t.createdAt)],
);

export const leadTasks = pgTable(
  'lead_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id').references(() => leads.id),
    title: text('title').notNull(),
    assigneeId: text('assignee_id')
      .notNull()
      .references(() => user.id),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lead_tasks_lead_idx').on(t.leadId),
    index('lead_tasks_due_idx').on(t.assigneeId, t.dueAt),
  ],
);

/** Timeline só guarda tipo, autoria e nomes de campos; nunca valores pessoais. */
export const leadTimeline = pgTable(
  'lead_timeline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    kind: text('kind').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    entityId: uuid('entity_id'),
    fields: text('fields')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lead_timeline_lead_idx').on(t.leadId, t.at),
    check(
      'timeline_kind_allowed',
      sql`${t.kind} in ('lead.created','lead.updated','lead.moved','lead.reassigned','lead.deleted','note.created','note.updated','task.created','task.updated','meeting.scheduled','meeting.rescheduled','meeting.canceled','meeting.outcome','sale.registered','sale.reversed','payment.received')`,
    ),
    check(
      'timeline_fields_allowed',
      sql`${t.fields} <@ ARRAY['name','phone','instagram','incomeBand','source','tier','stageKey','sdrId','closerId','nextContactAt','summary','body','title','dueAt','completedAt','assigneeId','scheduledAt','origin','outcome','canceledAt']::text[]`,
    ),
  ],
);

/** Avisos por pessoa, gerados no banco a partir da timeline (gatilho na migration 0019). */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    timelineId: uuid('timeline_id')
      .notNull()
      .references(() => leadTimeline.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

/** Filtros salvos da lista de leads, por pessoa (só critérios; nunca termo de busca ou contato). */
export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    name: text('name').notNull(),
    filters: jsonb('filters').$type<Record<string, string>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('saved_views_user_idx').on(t.userId, t.createdAt)],
);
