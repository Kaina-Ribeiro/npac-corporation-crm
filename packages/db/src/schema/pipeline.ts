import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { stageKeyEnum } from './enums.js';

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: stageKeyEnum('key').notNull().unique(),
  label: text('label').notNull(),
  position: integer('position').notNull(),
});
