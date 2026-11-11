import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { runMigrations } from '../src/migrate.js';
import { closeTestConnections, createEmptyTestDb, ownerSql } from '../src/testing.js';

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

describe('limpeza do módulo antigo', () => {
  /** Aplica só as migrations anteriores ao Acompanhamento v2, numa cópia da pasta `drizzle`. */
  async function migrarAteAntesDoV2(url: string) {
    const pasta = mkdtempSync(join(tmpdir(), 'npac-migrations-'));
    try {
      cpSync(fileURLToPath(new URL('../drizzle', import.meta.url)), pasta, { recursive: true });
      const arquivo = join(pasta, 'meta', '_journal.json');
      const journal = JSON.parse(readFileSync(arquivo, 'utf8')) as {
        entries: { tag: string }[];
      };
      const v2 = journal.entries.findIndex((e) => e.tag.includes('acompanhamento_v2'));
      if (v2 >= 0) journal.entries = journal.entries.slice(0, v2);
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

  it('limpeza remove o modelo antigo e enfileira a mídia antiga', async () => {
    const banco = 'npac_test_limpeza';
    const url = await createEmptyTestDb(banco);
    await migrarAteAntesDoV2(url);
    const owner = ownerSql(banco);
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto)
      values ('FICHA_ANTES', gen_random_uuid(), 'FOTO', 'antiga/1.jpg')`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, url_video)
      values ('FICHA_ANTES', gen_random_uuid(), 'LINK_VIDEO', 'https://youtu.be/x')`;

    await runMigrations(url);

    const [tabela] = await owner`select to_regclass('mentoria_mentorados') as t`;
    expect(tabela!.t).toBeNull();
    const [midia] = await owner`select count(*)::int as n from mentoria_midia`;
    expect(midia!.n).toBe(0);
    const fila = await owner`select chave_objeto, removido_em from mentoria_midia_exclusao`;
    expect(fila).toEqual([{ chave_objeto: 'antiga/1.jpg', removido_em: null }]);
    const sobra = await owner`select proname from pg_proc
      where proname in ('mentoria_excluir_registro', 'mentoria_excluir_pessoa', 'mentoria_travar_ficha')`;
    expect(sobra).toEqual([]);
  });
});
