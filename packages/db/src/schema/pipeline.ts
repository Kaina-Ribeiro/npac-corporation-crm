import { STAGE_KEYS } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

const systemKeys = sql.raw(STAGE_KEYS.map((k) => `'${k}'`).join(','));

/**
 * Colunas do pipeline. A liderança cria, renomeia, reordena e exclui (pedido de 04/11/2026);
 * as de sistema (chaves de `STAGE_KEYS`, com regra de negócio) não são excluídas.
 */
export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  position: integer('position').notNull(),
  system: boolean('system')
    .notNull()
    .generatedAlwaysAs(sql`key in (${systemKeys})`),
});
