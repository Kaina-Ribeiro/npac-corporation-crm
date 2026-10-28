import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema/index.js';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type { Sql };

export interface DbClient {
  db: Db;
  sql: Sql;
  close(): Promise<void>;
}

export function createDb(url: string, options: { max?: number } = {}): DbClient {
  const sql = postgres(url, { max: options.max ?? 10 });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}
