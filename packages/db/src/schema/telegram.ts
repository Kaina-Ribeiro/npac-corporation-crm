import { customType, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/**
 * Avisos pelo Telegram (NPAC-74): uma linha por pessoa. O id do chat vai cifrado (AES-256-GCM, pela
 * API) e o índice cego (HMAC) é único: um Telegram fica ligado a uma pessoa por vez. Grava só a
 * função `telegram_conectar` (o webhook, sem sessão); cada um vê e apaga só o seu (RLS).
 */
export const telegramVinculos = pgTable('telegram_vinculos', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  chatEnc: bytea('chat_enc').notNull(),
  chatBidx: text('chat_bidx').notNull().unique(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

/** Código do "Conectar Telegram": só o SHA-256, uso único, 10 minutos. Só pelas funções. */
export const telegramCodigos = pgTable('telegram_codigos', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  hash: bytea('hash').notNull().unique(),
  venceEm: timestamp('vence_em', { withTimezone: true }).notNull(),
});
