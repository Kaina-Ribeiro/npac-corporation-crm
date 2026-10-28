import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// src/ e dist/ ficam um nível abaixo da raiz do pacote, onde mora ./drizzle.
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** Aplica as migrations pendentes. Use uma URL com a role dona (npac_owner). */
export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
