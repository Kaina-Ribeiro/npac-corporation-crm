import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate.js';
import { closeTestConnections, createEmptyTestDb, ownerSql } from '../src/testing.js';

// Cargos em um passo (spec 2026-11-11): SDR, Closer e Acompanhamento têm as caixas fixas no banco.
const BANCO = 'npac_test_cargos';
const owner = ownerSql(BANCO);

/** Aplica as migrations anteriores à de cargos, numa cópia da pasta `drizzle`. */
async function migrarAteAntesDosCargos(url: string) {
  const pasta = mkdtempSync(join(tmpdir(), 'npac-migrations-'));
  try {
    cpSync(fileURLToPath(new URL('../drizzle', import.meta.url)), pasta, { recursive: true });
    const arquivo = join(pasta, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(arquivo, 'utf8')) as { entries: { tag: string }[] };
    const i = journal.entries.findIndex((e) => e.tag.includes('cargos'));
    expect(i).toBeGreaterThan(0);
    journal.entries = journal.entries.slice(0, i);
    writeFileSync(arquivo, JSON.stringify(journal));
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(sql), { migrationsFolder: pasta });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

beforeAll(async () => {
  const url = await createEmptyTestDb(BANCO);
  await migrarAteAntesDosCargos(url);
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      ('sdr-fecha', 'SDR que fecha', 'a@c.test', 'SDR', true, true),
      ('sdr-nada', 'SDR sem caixa', 'b@c.test', 'SDR', false, false),
      ('closer-prospecta', 'Closer', 'c@c.test', 'CLOSER', true, false),
      ('acomp', 'Acomp', 'd@c.test', 'ACOMPANHAMENTO', true, true),
      ('head', 'Head', 'e@c.test', 'HEAD', true, true),
      ('dir', 'Dir', 'f@c.test', 'DIRETOR', false, false)`;
  await runMigrations(url);
});

afterAll(closeTestConnections);

const caixas = async (id: string) =>
  (
    await owner<{ p: boolean; c: boolean }[]>`
      select can_prospect as p, can_close as c from "user" where id = ${id}`
  )[0];

describe('migration de cargos', () => {
  it('normaliza SDR, Closer e Acompanhamento; liderança fica como estava', async () => {
    expect(await caixas('sdr-fecha')).toEqual({ p: true, c: false });
    expect(await caixas('sdr-nada')).toEqual({ p: true, c: false });
    expect(await caixas('closer-prospecta')).toEqual({ p: false, c: true });
    expect(await caixas('acomp')).toEqual({ p: false, c: false });
    expect(await caixas('head')).toEqual({ p: true, c: true });
    expect(await caixas('dir')).toEqual({ p: false, c: false });
  });

  it('CHECK recusa combinação sem sentido', async () => {
    await expect(
      owner`update "user" set can_close = true where id = 'sdr-fecha'`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      owner`update "user" set can_prospect = true where id = 'closer-prospecta'`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      owner`update "user" set can_prospect = true where id = 'acomp'`,
    ).rejects.toMatchObject({ code: '23514' });
    // Troca de cargo sem ajustar as caixas também é recusada.
    await expect(owner`update "user" set role = 'SDR' where id = 'head'`).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      owner`insert into "user" (id, name, email, role) values ('x', 'X', 'x@c.test', 'SDR')`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('Head e Diretoria escolhem livremente', async () => {
    await owner`update "user" set can_prospect = false, can_close = true where id = 'head'`;
    await owner`update "user" set can_prospect = true where id = 'dir'`;
    expect(await caixas('head')).toEqual({ p: false, c: true });
    expect(await caixas('dir')).toEqual({ p: true, c: false });
  });
});
