import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closeTestConnections, ownerSql } from '../src/testing.js';

const DB = 'npac_test_db';

afterAll(async () => {
  await closeTestConnections();
});

describe('migrations', () => {
  it('aplica migrations e cria tabelas', async () => {
    const rows = await ownerSql(
      DB,
    )`select table_name from information_schema.tables where table_schema='public'`;
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
    const [r] = await ownerSql(
      DB,
    )`select rolbypassrls, rolsuper from pg_roles where rolname='npac_app'`;
    expect(r).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('habilita as extensões pgcrypto e pg_trgm', async () => {
    const rows = await ownerSql(DB)`select extname from pg_extension`;
    expect(rows.map((r) => r.extname)).toEqual(expect.arrayContaining(['pgcrypto', 'pg_trgm']));
  });

  it('enum role contém ACOMPANHAMENTO depois do migrate', async () => {
    const rows = await ownerSql(DB)`
      select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'role' order by e.enumsortorder`;
    expect(rows.map((r) => r.enumlabel)).toContain('ACOMPANHAMENTO');
  });
});

describe('journal das migrations', () => {
  // O migrator só aplica migration com `when` maior que o da última aplicada. Um `when` fora
  // de ordem (ex.: branch antiga encaixada depois de outra) seria pulado em silêncio em produção.
  it('idx e `when` crescem juntos, um por um', () => {
    const journal = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url)),
        'utf8',
      ),
    ) as { entries: { idx: number; when: number; tag: string }[] };
    journal.entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      expect(e.tag.startsWith(String(i).padStart(4, '0'))).toBe(true);
      if (i > 0) expect(e.when).toBeGreaterThan(journal.entries[i - 1]!.when);
    });
  });
});
