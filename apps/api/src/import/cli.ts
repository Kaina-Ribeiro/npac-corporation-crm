// `pnpm --filter @npac/api import:firebase <export.json> [--apply] [--default-sdr email]`
// Sem --apply é só simulação (dry-run): valida tudo e desfaz. Usa DATABASE_URL (owner).
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { loadEnv } from '../config/env.js';
import { importFirebase } from './importer.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) throw new Error('Informe o arquivo JSON exportado do Firebase');
const sdrFlag = args.indexOf('--default-sdr');
const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) throw new Error('DATABASE_URL não definida');
const env = loadEnv(process.env);
const sql = postgres(ownerUrl, { max: 1 });
try {
  const report = await importFirebase(
    sql,
    new FieldCrypto(env.FIELD_ENCRYPTION_KEY, env.BLIND_INDEX_KEY),
    JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>,
    {
      dryRun: !args.includes('--apply'),
      defaultSdrEmail: sdrFlag >= 0 ? args[sdrFlag + 1] : undefined,
    },
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await sql.end();
}
