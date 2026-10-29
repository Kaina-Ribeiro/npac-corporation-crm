// Pedidos de acesso: quem ainda não tem conta pede pela tela de login e a liderança aprova.
// Fica fora de `user` de propósito: pedido pendente não existe para o Better Auth.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const accessRequests = pgTable('access_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
