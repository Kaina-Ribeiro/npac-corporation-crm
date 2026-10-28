import { resetTestDb } from '../src/testing.js';

export default async function setup(): Promise<void> {
  await resetTestDb('npac_test_db');
}
