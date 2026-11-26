import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { naoVistas, NOVIDADES, type PessoaNovidades } from '@npac/shared/novidades';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate.js';
import { closeTestConnections, createEmptyTestDb, ownerSql } from '../src/testing.js';

// NPAC-77 (Gabriel, 25/11/2026, ITODEV: "logando como eduarda, a janela não abriu"): a coluna
// vazia virava a mais nova (`npac-77-versao`), então ninguém via a janela da própria novidade. A
// 0089 põe quem já existia na entrada logo abaixo: a janela abre uma vez, só com a `npac-77-versao`.
const BANCO = 'npac_test_novidades_inicial';
const owner = ownerSql(BANCO);
const MIGRATION = 'novidades_janela_inicial';
const ABAIXO = 'npac-75-dashboard';

async function migrarAteAntes(url: string) {
  const pasta = mkdtempSync(join(tmpdir(), 'npac-migrations-'));
  try {
    cpSync(fileURLToPath(new URL('../drizzle', import.meta.url)), pasta, { recursive: true });
    const arquivo = join(pasta, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(arquivo, 'utf8')) as { entries: { tag: string }[] };
    const i = journal.entries.findIndex((e) => e.tag.includes(MIGRATION));
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

const vista = async (id: string) =>
  (
    await owner<{ v: string | null }[]>`select novidades_vista as v from "user" where id = ${id}`
  )[0]!.v;

beforeAll(async () => {
  const url = await createEmptyTestDb(BANCO);
  await migrarAteAntes(url);
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close, novidades_vista) values
      ('u-dir', 'Diretoria', 'dir@npac.test', 'DIRETOR', true, true, null),
      ('u-sdr', 'Ale', 'ale@npac.test', 'SDR', true, false, null),
      ('u-itodev', 'Duda', 'duda@npac.test', 'SDR', true, false, 'npac-77-versao'),
      ('u-antiga', 'Ana', 'ana@npac.test', 'SDR', true, false, 'npac-73-chat-novo')`;
  await runMigrations(url);
});

afterAll(closeTestConnections);

describe('janela da novidade do NPAC-77 para quem já existia (0089)', () => {
  it('a entrada logo abaixo da npac-77-versao é a do Dashboard', () => {
    const i = NOVIDADES.findIndex((n) => n.id === 'npac-77-versao');
    expect(NOVIDADES[i + 1]!.id).toBe(ABAIXO);
  });

  it('conta vazia e a que o ITODEV já tinha marcado voltam para logo abaixo da novidade', async () => {
    expect(await vista('u-dir')).toBe(ABAIXO);
    expect(await vista('u-sdr')).toBe(ABAIXO);
    expect(await vista('u-itodev')).toBe(ABAIXO);
  });

  it('quem já tinha uma vista mais antiga fica como estava', async () => {
    expect(await vista('u-antiga')).toBe('npac-73-chat-novo');
  });

  // Entradas mais novas que a npac-77-versao entram também; nada mais antigo que ela.
  it('a janela abre a partir da npac-77-versao, para todo cargo', () => {
    const pessoas: PessoaNovidades[] = [
      { mestre: true, areas: [] },
      { mestre: false, areas: [{ area: 'COMERCIAL', cargo: 'SDR', head: false }] },
      { mestre: false, areas: [{ area: 'COMERCIAL', cargo: 'CLOSER', head: false }] },
      { mestre: false, areas: [{ area: 'ACOMPANHAMENTO', cargo: 'ACOMPANHAMENTO', head: true }] },
    ];
    for (const p of pessoas)
      expect(
        naoVistas(p, ABAIXO)
          .map((n) => n.id)
          .at(-1),
      ).toBe('npac-77-versao');
  });

  it('conta criada depois continua vazia (o /api/me grava a mais nova e nada abre)', async () => {
    await owner`insert into "user" (id, name, email, role, can_prospect, can_close)
      values ('u-nova', 'Nova', 'nova@npac.test', 'SDR', true, false)`;
    expect(await vista('u-nova')).toBeNull();
  });
});
