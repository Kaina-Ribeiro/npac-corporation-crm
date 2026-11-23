// Acesso por área (NPAC-54, spec docs/superpowers/specs/2026-11-19-acesso-por-area-design.md):
// `area_membros` é a fonte única do cargo. Uma linha por (pessoa, área); a Diretoria é `user.mestre`
// e não tem linha. `user.role` é um resumo calculado por gatilho (0072). `npac_app` só lê (RLS: a
// própria linha, a Mestre ou o Head da área); escrita só pelas funções `area_*` (e, até a fase 5,
// pela escrita antiga em `user.role`, traduzida por gatilho).
import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

export const areaMembros = pgTable(
  'area_membros',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    area: text('area').notNull(),
    // Comercial: SDR, CLOSER ou HEAD. Acompanhamento: o perfil, ou nulo ("falta perfil").
    cargo: text('cargo'),
    // Comercial: head = (cargo = HEAD). Acompanhamento: o selo "Admin do Acompanhamento".
    head: boolean('head').notNull().default(false),
    // Alcance (NPAC-54, Fase 3B): TODOS = todos os mentorados; CARTEIRA = só as inscrições em que a
    // pessoa é a responsável. CARTEIRA só no cargo Acompanhamento, sem o selo de Admin.
    alcance: text('alcance').notNull().default('TODOS'),
    definidoPor: text('definido_por').references(() => user.id, { onDelete: 'set null' }),
    definidoEm: timestamp('definido_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.area], name: 'area_membros_pk' }),
    check('area_membros_area', sql`${t.area} in ('COMERCIAL', 'ACOMPANHAMENTO')`),
    check(
      'area_membros_comercial',
      sql`${t.area} <> 'COMERCIAL' or (${t.cargo} is not null
        and ${t.cargo} in ('SDR', 'CLOSER', 'HEAD') and ${t.head} = (${t.cargo} = 'HEAD'))`,
    ),
    check(
      'area_membros_acompanhamento',
      sql`${t.area} <> 'ACOMPANHAMENTO' or (${t.cargo} is null and not ${t.head})
        or (${t.cargo} is not null
          and ${t.cargo} in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR', 'ENVIOS'))`,
    ),
    check(
      'area_membros_alcance',
      sql`${t.alcance} = 'TODOS' or (${t.alcance} = 'CARTEIRA' and ${t.area} = 'ACOMPANHAMENTO'
        and ${t.cargo} = 'ACOMPANHAMENTO' and not ${t.head})`,
    ),
  ],
);
