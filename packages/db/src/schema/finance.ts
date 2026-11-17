import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { leads } from './leads.js';
import { meetings } from './meetings.js';
import { pipelineStages } from './pipeline.js';

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    closerId: text('closer_id')
      .notNull()
      .references(() => user.id),
    priceCents: integer('price_cents').notNull(),
    /** Renda extra do SDR por venda deste produto (NPAC-48, Igor 17/11/2026); a liderança edita. */
    sdrBonusCents: integer('sdr_bonus_cents').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    check('product_positive_price', sql`${t.priceCents} > 0`),
    check('product_sdr_bonus', sql`${t.sdrBonusCents} >= 0`),
  ],
);

/**
 * Venda marcada pelo SDR depois da reunião realizada (NPAC-48): o produto, sem valor, e a renda
 * extra do SDR na data da marcação (1A). `bonus_cents` guarda o valor do catálogo naquele dia.
 * Sai (`canceled_at`) quando o lead deixa a Venda ou a venda é estornada (gatilhos da 0066).
 */
export const sdrSaleMarks = pgTable(
  'sdr_sale_marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    sdrId: text('sdr_id')
      .notNull()
      .references(() => user.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id),
    bonusCents: integer('bonus_cents').notNull(),
    markedBy: text('marked_by')
      .notNull()
      .references(() => user.id),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sdr_sale_marks_one_active')
      .on(t.leadId)
      .where(sql`${t.canceledAt} is null`),
    index('sdr_sale_marks_sdr_idx').on(t.sdrId, t.markedAt),
    check('sdr_sale_mark_bonus', sql`${t.bonusCents} >= 0`),
  ],
);

export const deals = pgTable(
  'deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    productName: text('product_name').notNull(),
    catalogPriceCents: integer('catalog_price_cents').notNull(),
    closerId: text('closer_id')
      .notNull()
      .references(() => user.id),
    sdrId: text('sdr_id')
      .notNull()
      .references(() => user.id),
    totalCents: integer('total_cents').notNull(),
    method: text('method').notNull(),
    requestKey: uuid('request_key').notNull().unique(),
    requestHash: text('request_hash').notNull().default(''),
    previousStageId: uuid('previous_stage_id').references(() => pipelineStages.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: text('reversed_by').references(() => user.id),
    version: integer('version').notNull().default(1),
    legacyId: text('legacy_id').unique(),
  },
  (t) => [
    index('deals_lead_idx').on(t.leadId),
    uniqueIndex('deals_one_active_lead')
      .on(t.leadId)
      .where(sql`${t.reversedAt} is null`),
    index('deals_closed_idx').on(t.closedAt),
    check('deal_positive_total', sql`${t.totalCents} > 0 and ${t.catalogPriceCents} > 0`),
    check('deal_method', sql`${t.method} in ('CARD','PIX','BANK_SLIP','PARTIAL')`),
    check('deal_reversal_pair', sql`(${t.reversedAt} is null) = (${t.reversedBy} is null)`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id),
    amountCents: integer('amount_cents').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidBy: text('paid_by').references(() => user.id),
    receiptKey: uuid('receipt_key').unique(),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    index('payments_deal_idx').on(t.dealId),
    index('payments_due_idx').on(t.dueAt),
    check('payment_positive_amount', sql`${t.amountCents} > 0`),
    check(
      'payment_receipt_pair',
      sql`(${t.paidAt} is null) = (${t.paidBy} is null) and (${t.paidAt} is null) = (${t.receiptKey} is null)`,
    ),
  ],
);
