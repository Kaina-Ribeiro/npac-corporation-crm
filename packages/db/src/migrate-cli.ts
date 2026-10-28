// `pnpm --filter @npac/db migrate`: aplica as migrations como owner usando DATABASE_URL.
import { runMigrations } from './migrate.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');
await runMigrations(url);
console.log('Migrations aplicadas.');
