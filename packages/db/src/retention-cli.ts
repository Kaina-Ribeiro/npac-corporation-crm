// `pnpm --filter @npac/db retention`: worker LGPD diário, como owner usando DATABASE_URL.
import { runRetention } from './retention.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');
const days = Number(process.env.RETENTION_DELETED_DAYS ?? 180);
console.log(`Retenção: ${await runRetention(url, days)} titular(es) anonimizado(s).`);
