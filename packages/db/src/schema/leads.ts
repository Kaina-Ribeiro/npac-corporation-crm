import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import {
  incomeBandEnum,
  leadLostReasonEnum,
  leadSourceEnum,
  legalBasisEnum,
  tierEnum,
} from './enums.js';
import { products } from './finance.js';
import { pipelineStages } from './pipeline.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phoneEnc: bytea('phone_enc'),
    phoneBidx: text('phone_bidx'),
    instagram: text('instagram'),
    incomeBand: incomeBandEnum('income_band').notNull(),
    source: leadSourceEnum('source').notNull(),
    /** Texto livre de quando a origem é "Outro" (até 80 caracteres). */
    sourceOther: text('source_other'),
    tier: tierEnum('tier').notNull(),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => pipelineStages.id),
    sdrId: text('sdr_id')
      .notNull()
      .references(() => user.id),
    closerId: text('closer_id').references(() => user.id),
    nextContactAt: timestamp('next_contact_at', { withTimezone: true }),
    summary: text('summary'),
    /** Agendou Pagamento: produto e valor combinados (só nessa etapa; a API limpa ao sair). */
    paymentProductId: uuid('payment_product_id').references((): AnyPgColumn => products.id),
    paymentAmountCents: integer('payment_amount_cents'),
    /** Agendou Pagamento parcial (NPAC-41): entrada já paga; o restante vence em `next_contact_at`. */
    paymentEntryCents: integer('payment_entry_cents'),
    /** "Já pagou uma entrada": o SDR só marca sim/não; o valor quem informa é o closer (item 13). */
    paymentEntryPaid: boolean('payment_entry_paid').notNull().default(false),
    /**
     * Venda a registrar (NPAC-41): produto vendido informado no cadastro em Venda Fechada, sem
     * valores (o closer registra). Apagado quando a venda é registrada ou o lead sai da Venda.
     */
    soldProductId: uuid('sold_product_id').references((): AnyPgColumn => products.id),
    /** Sem Perfil: motivo e, com "Outro", o texto (até 80 caracteres; a LGPD apaga). */
    lostReason: leadLostReasonEnum('lost_reason'),
    lostReasonOther: text('lost_reason_other'),
    legalBasis: legalBasisEnum('legal_basis').notNull().default('LEGITIMATE_INTEREST'),
    retentionUntil: date('retention_until'),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    /** ID do registro no Firebase, para importação idempotente. */
    legacyId: text('legacy_id').unique(),
  },
  (t) => [
    index('leads_sdr_id_idx').on(t.sdrId),
    index('leads_closer_id_idx').on(t.closerId),
    index('leads_next_contact_at_idx').on(t.nextContactAt),
    index('leads_phone_bidx_idx').on(t.phoneBidx),
    index('leads_instagram_idx').on(t.instagram),
    index('leads_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    check(
      'leads_source_other_check',
      sql`${t.sourceOther} is null or (${t.source} = 'OUTRO' and char_length(${t.sourceOther}) between 1 and 80)`,
    ),
    // O valor exige produto; produto sem valor é o pagamento a completar (o SDR informa só o
    // produto). A etapa (FK) o CHECK não enxerga: essa regra fica na API.
    check(
      'leads_payment_check',
      sql`${t.paymentAmountCents} is null or (${t.paymentProductId} is not null and ${t.paymentAmountCents} > 0)`,
    ),
    // A entrada só existe com o valor combinado, e fica abaixo dele.
    check(
      'leads_payment_entry_check',
      sql`${t.paymentEntryCents} is null or (${t.paymentAmountCents} is not null and ${t.paymentEntryCents} > 0 and ${t.paymentEntryCents} < ${t.paymentAmountCents})`,
    ),
    check(
      'leads_lost_reason_other_check',
      sql`${t.lostReasonOther} is null or (${t.lostReason} = 'OUTRO' and char_length(${t.lostReasonOther}) between 1 and 80)`,
    ),
  ],
);
