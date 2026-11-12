import { sql } from 'drizzle-orm';
import { bigint, boolean, check, pgTable } from 'drizzle-orm/pg-core';

/**
 * Contador global do canal ao vivo (desempenho, Fase 3): uma linha só, que o gatilho
 * `app_revision_bump` incrementa a cada transação que escreve nas tabelas do resumo antigo (leads,
 * tarefas, timeline, chat, avisos). A API lê `n` a cada 2 s, uma vez por processo. RLS, gatilhos e
 * grants são SQL manual (0062).
 */
export const appRevision = pgTable(
  'app_revision',
  {
    id: boolean('id').primaryKey().default(true),
    n: bigint('n', { mode: 'number' }).notNull().default(0),
  },
  (t) => [check('app_revision_uma_linha', sql`${t.id}`)],
);
