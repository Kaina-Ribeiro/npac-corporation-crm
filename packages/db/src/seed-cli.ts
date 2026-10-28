// `pnpm --filter @npac/db seed`: roda o seed como owner usando DATABASE_URL.
// O hash é argon2id (@node-rs/argon2), o mesmo que o Better Auth verifica na API.
import { hash } from '@node-rs/argon2';
import { createDb } from './client.js';
import { seed } from './seed.js';

const url = process.env.DATABASE_URL;
const initialPassword = process.env.SEED_INITIAL_PASSWORD;
if (!url) throw new Error('DATABASE_URL não definida');
if (!initialPassword)
  throw new Error('SEED_INITIAL_PASSWORD não definida — o seed não roda sem ela');

const client = createDb(url, { max: 1 });
try {
  await seed(client.db, { hashPassword: (p) => hash(p), initialPassword });
  console.log('Seed concluído.');
} finally {
  await client.close();
}
