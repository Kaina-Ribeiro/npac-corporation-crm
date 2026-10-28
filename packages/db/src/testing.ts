// Helpers de teste (subpath `@npac/db/testing`). Cada suíte usa um banco próprio
// (ex.: npac_test_db, npac_test_api, npac_e2e) para que suítes paralelas não colidam.
import postgres, { type Sql } from 'postgres';
import { createDb, type Db } from './client.js';
import { runMigrations } from './migrate.js';

const TEST_DB_NAME = /^npac_(test|e2e)(_[a-z0-9_]+)?$/;

const opened: Sql[] = [];

function urlFor(dbName: string, user?: string, password?: string): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL não definida');
  const u = new URL(raw);
  u.pathname = `/${dbName}`;
  if (user) u.username = user;
  if (password !== undefined) u.password = password;
  return u.toString();
}

function appUrl(dbName: string): string {
  const pw = process.env.APP_DB_PASSWORD;
  if (!pw) throw new Error('APP_DB_PASSWORD não definida');
  return urlFor(dbName, 'npac_app', pw);
}

function track(sql: Sql): Sql {
  opened.push(sql);
  return sql;
}

/** Conexão postgres-js como npac_owner (dono/superuser) no banco `dbName`. */
export function ownerSql(dbName: string): Sql {
  return track(postgres(urlFor(dbName), { max: 2, onnotice: () => {} }));
}

/** Conexão postgres-js como npac_app (sujeita a RLS) no banco `dbName`. */
export function appSql(dbName: string): Sql {
  return track(postgres(appUrl(dbName), { max: 2, onnotice: () => {} }));
}

/** Drizzle conectado como npac_app. */
export function appDb(dbName: string): Db {
  const client = createDb(appUrl(dbName), { max: 2 });
  opened.push(client.sql);
  return client.db;
}

/** Recria o banco `dbName`, concede CONNECT ao npac_app, roda migrations e devolve a URL do owner. */
export async function resetTestDb(dbName: string): Promise<string> {
  if (!TEST_DB_NAME.test(dbName)) {
    throw new Error(`resetTestDb só aceita bancos de teste (npac_test*, npac_e2e*): ${dbName}`);
  }
  const admin = postgres(urlFor('postgres'), { max: 1, onnotice: () => {} });
  try {
    await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${dbName} and pid <> pg_backend_pid()`;
    await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    await admin.unsafe(`GRANT CONNECT ON DATABASE "${dbName}" TO npac_app`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const url = urlFor(dbName);
  await runMigrations(url);
  return url;
}

/** Fecha todas as conexões abertas por ownerSql/appSql/appDb (chame no afterAll). */
export async function closeTestConnections(): Promise<void> {
  await Promise.all(opened.splice(0).map((s) => s.end({ timeout: 5 })));
}
