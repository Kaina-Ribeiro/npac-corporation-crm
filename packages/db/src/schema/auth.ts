// Tabelas do Better Auth (core + plugin twoFactor + rate limit em banco),
// escritas à mão com nomes snake_case. As colunas extras de `user` são do domínio.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { roleEnum } from './enums.js';

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    // Plugin username do Better Auth: o login é por usuário (minúsculo); e-mail fica como contato.
    username: text('username').unique(),
    displayUsername: text('display_username'),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    twoFactorEnabled: boolean('two_factor_enabled').default(false),
    // Resumo calculado de `area_membros` + `mestre` (0072, NPAC-54): não é a fonte do cargo.
    role: roleEnum('role').notNull(),
    canProspect: boolean('can_prospect').notNull().default(false),
    canClose: boolean('can_close').notNull().default(false),
    active: boolean('active').notNull().default(true),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    // Conta Mestre = Diretoria (0072): sem vínculo em `area_membros`, Head de todas as áreas.
    mestre: boolean('mestre').notNull().default(false),
    // Última vez que a pessoa usou o sistema ("entrou há X", NPAC-54 D12/M12): gravada pela guarda
    // de sessão no máximo a cada 15 min; o Sair não apaga. `user` fica fora do canal ao vivo.
    ultimoUso: timestamp('ultimo_uso', { withTimezone: true }),
  },
  // Cargos em um passo (0049): SDR, Closer e Acompanhamento têm as caixas definidas pelo cargo;
  // só Head e Diretoria escolhem "Atua como SDR/Closer". Cargo comparado como texto.
  (t) => [
    check(
      'user_cargo_caixas',
      sql`case ${t.role}::text
        when 'SDR' then ${t.canProspect} and not ${t.canClose}
        when 'CLOSER' then ${t.canClose} and not ${t.canProspect}
        when 'ACOMPANHAMENTO' then not ${t.canProspect} and not ${t.canClose}
        else true end`,
    ),
  ],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * Foto do perfil (NPAC-53): uma por pessoa, já reduzida no navegador (256 px). Sem RLS, como
 * `user`: só a API grava, pela sessão da própria pessoa. A versão fica em `user.image`.
 */
export const userPhotos = pgTable(
  'user_photos',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    bytes: bytea('bytes').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('user_photos_mime', sql`${t.mime} in ('image/jpeg', 'image/png', 'image/webp')`),
    check('user_photos_size', sql`${t.size} between 1 and 204800`),
  ],
);

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const twoFactor = pgTable('two_factor', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  verified: boolean('verified').default(true),
  failedVerificationCount: integer('failed_verification_count').default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
