import { hash } from '@node-rs/argon2';
import { createDb, seed } from '@npac/db';
import { resetTestDb } from '@npac/db/testing';

export const TEST_PASSWORD = 'senha-de-teste-123';

export default async function setup(): Promise<void> {
  const url = await resetTestDb('npac_test_api');
  const client = createDb(url, { max: 1 });
  try {
    await seed(client.db, { hashPassword: (p) => hash(p), initialPassword: TEST_PASSWORD });
  } finally {
    await client.close();
  }
}
