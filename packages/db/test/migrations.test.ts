import { afterAll, describe, expect, it } from 'vitest';
import { closeTestConnections, ownerSql } from '../src/testing.js';

const DB = 'npac_test_db';

afterAll(async () => {
  await closeTestConnections();
});

describe('migrations', () => {
  it('aplica migrations e cria tabelas', async () => {
    const rows = await ownerSql(DB)`select table_name from information_schema.tables where table_schema='public'`;
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        'user',
        'session',
        'account',
        'verification',
        'two_factor',
        'rate_limit',
        'pipeline_stages',
        'leads',
        'meetings',
        'audit_log',
      ]),
    );
  });

  it('npac_app não é dono nem ignora RLS', async () => {
    const [r] = await ownerSql(DB)`select rolbypassrls, rolsuper from pg_roles where rolname='npac_app'`;
    expect(r).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('habilita as extensões pgcrypto e pg_trgm', async () => {
    const rows = await ownerSql(DB)`select extname from pg_extension`;
    expect(rows.map((r) => r.extname)).toEqual(expect.arrayContaining(['pgcrypto', 'pg_trgm']));
  });
});
