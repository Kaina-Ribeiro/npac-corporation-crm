import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { leads } from './leads.js';

/** Canal Geral (único) ou DM 1-para-1 identificada pelo par ordenado de usuários. */
export const chatChannels = pgTable(
  'chat_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    dmKey: text('dm_key').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'chat_channel_kind',
      sql`${t.kind} in ('GENERAL','DM') and (${t.kind} = 'DM') = (${t.dmKey} is not null)`,
    ),
    uniqueIndex('chat_one_general')
      .on(t.kind)
      .where(sql`${t.kind} = 'GENERAL'`),
  ],
);

export const chatMembers = pgTable(
  'chat_members',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => chatChannels.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
  },
  (t) => [
    primaryKey({ columns: [t.channelId, t.userId] }),
    index('chat_members_user_idx').on(t.userId),
  ],
);

/** Mensagens são append-only; a menção guarda só o ID do lead. */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => chatChannels.id),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id),
    body: text('body').notNull(),
    leadId: uuid('lead_id').references(() => leads.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('chat_body_length', sql`char_length(${t.body}) between 1 and 2000`),
    index('chat_messages_channel_idx').on(t.channelId, t.id),
  ],
);

export const chatReads = pgTable(
  'chat_reads',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => chatChannels.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    lastReadId: bigint('last_read_id', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

export const playbookScripts = pgTable(
  'playbook_scripts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    position: integer('position').notNull().default(0),
    version: integer('version').notNull().default(1),
    updatedBy: text('updated_by').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('playbook_topic_title').on(t.topic, t.title),
    check(
      'playbook_lengths',
      sql`char_length(${t.title}) between 1 and 200 and char_length(${t.body}) between 1 and 10000`,
    ),
  ],
);
