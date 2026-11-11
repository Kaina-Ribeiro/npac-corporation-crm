import { customType, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { leads } from './leads.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/** Respostas do Google Forms ligadas a um lead (NPAC-42). Gravação só por `form_response_record`. */
export const formResponses = pgTable(
  'form_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** ID da resposta no Google: torna o reenvio idempotente. */
    responseId: text('response_id').notNull().unique(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    /** Perguntas e respostas em JSON cifrado; a LGPD zera. */
    answersEnc: bytea('answers_enc'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('form_responses_lead_idx').on(t.leadId)],
);
