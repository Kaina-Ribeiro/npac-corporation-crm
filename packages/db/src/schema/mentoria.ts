// Módulo Acompanhamento (mentorados). Sem FK para leads, deals, meetings ou lead_timeline: é
// uma base à parte. Acesso por RLS com mentoria_pode() (papel cru DIRETOR ou ACOMPANHAMENTO,
// nunca app_role(), que devolve HEAD para a Diretoria). Sem GRANT DELETE: exclusão só por função.
import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

export const mentoriaMentorados = pgTable(
  'mentoria_mentorados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull(),
    nomeNorm: text('nome_norm').notNull().unique(),
    tipoCadastro: text('tipo_cadastro'),
    tipoMentoria: text('tipo_mentoria'),
    /** Data de entrada como foi colada; `data_entrada` é derivada para ordem e filtro (D9). */
    dataEntradaTexto: text('data_entrada_texto'),
    dataEntrada: date('data_entrada'),
    status: text('status').notNull(),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').references(() => user.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('mentoria_mentorados_nome', sql`char_length(${t.nome}) between 1 and 200`),
    check('mentoria_mentorados_status', sql`${t.status} in ('ENGAJADO', 'EM_ATENCAO', 'EM_RISCO')`),
  ],
);
