// Pedidos de acesso: quem ainda não tem conta pede pela tela de login e a liderança aprova.
// Fica fora de `user` de propósito: pedido pendente não existe para o Better Auth.
import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const accessRequests = pgTable(
  'access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    username: text('username').notNull().unique(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    // Tela de onde veio o pedido (NPAC-51): `/login` (COMERCIAL) ou `/login/acompanhamento`.
    area: text('area', { enum: ['COMERCIAL', 'ACOMPANHAMENTO'] })
      .notNull()
      .default('COMERCIAL'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('access_requests_area_check', sql`${t.area} in ('COMERCIAL', 'ACOMPANHAMENTO')`)],
);
