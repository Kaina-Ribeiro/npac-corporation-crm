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

// NPAC-82 (Igor, 27/11/2026): reuniões repetidas do mesmo lead no mesmo minuto, marcadas
// realizadas, somavam o valor por reunião duas vezes. A 0094 deixa uma só (as outras viram
// canceladas, nada é apagado) e o banco passa a recusar a repetição.
const BANCO = 'npac_test_reuniao_duplicada';
const owner = ownerSql(BANCO);
const MIGRATION = 'reuniao_duplicada';

/** Aplica as migrations anteriores à da correção, numa cópia da pasta `drizzle`. */
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

const id = async (q: Promise<unknown>) => ((await q) as { id: string }[])[0]!.id;
const leads: Record<string, string> = {};
const reunioes: Record<string, string> = {};
let etapa: string;
let produto: string;

async function lead(nome: string) {
  leads[nome] = await id(owner`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram)
    values (${nome}, 'R8_15K', 'BIO', 'P1', ${etapa}, 'u-ale', 'u-ale', ${nome}) returning id`);
}

/** Reunião do lead às 21:00 UTC de 27/11 (+ `segundos`), criada `criada` minutos atrás. */
async function reuniao(
  chave: string,
  nome: string,
  {
    outcome = null as string | null,
    segundos = 0,
    criada = 0,
    cancelada = false,
    hora = '21:00',
  } = {},
) {
  reunioes[chave] = await id(owner`
    insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, outcome, outcome_at,
      created_at, canceled_at)
    values (${leads[nome]!}, 'u-sonia',
      ${`2026-11-27T${hora}:${String(segundos).padStart(2, '0')}Z`}::timestamptz, 'DIRETO', 'u-ale',
      ${outcome}::meeting_outcome, ${outcome ? '2026-11-27T21:30:00Z' : null}::timestamptz,
      now() - make_interval(mins => ${criada}), ${cancelada ? '2026-11-27T20:00:00Z' : null}::timestamptz)
    returning id`);
}

const estado = (chave: string) =>
  owner<{ cancelada: boolean; version: number }[]>`
    select canceled_at is not null as cancelada, version from meetings where id = ${reunioes[chave]!}`.then(
    (r) => r[0]!,
  );

beforeAll(async () => {
  const url = await createEmptyTestDb(BANCO);
  await migrarAteAntes(url);
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true, false),
      ('u-sonia', 'Sônia', 'sonia@npac.test', 'CLOSER', false, true)`;
  etapa = await id(owner`
    insert into pipeline_stages (key, label, position) values ('AGENDADO', 'Agendado', 1) returning id`);
  produto = await id(owner`
    insert into products (code, name, closer_id, price_cents, sdr_bonus_cents)
    values ('NACAO_PADRAO', 'Nação Padrão', 'u-sonia', 300000, 1000) returning id`);

  // 1. O caso do Igor: duas realizadas no mesmo minuto. Fica a mais antiga.
  await lead('igor');
  await reuniao('igor-antiga', 'igor', { outcome: 'DONE', criada: 60 });
  await reuniao('igor-nova', 'igor', { outcome: 'DONE', criada: 5, segundos: 30 });

  // 2. A que tem a renda extra da venda fica, mesmo sendo a mais nova.
  await lead('venda');
  await reuniao('venda-antiga', 'venda', { outcome: 'DONE', criada: 60 });
  await reuniao('venda-nova', 'venda', { outcome: 'DONE', criada: 5 });
  await owner`insert into sdr_sale_marks (lead_id, sdr_id, product_id, meeting_id, bonus_cents, marked_by)
    values (${leads.venda!}, 'u-ale', ${produto}, ${reunioes['venda-nova']!}, 1000, 'u-ale')`;

  // 3. Realizada e outra sem resultado: fica a realizada.
  await lead('aberta');
  await reuniao('aberta-sem', 'aberta', { criada: 60 });
  await reuniao('aberta-feita', 'aberta', { outcome: 'DONE', criada: 5 });

  // 4. Uma já cancelada não conta como repetida.
  await lead('cancelada');
  await reuniao('cancelada-velha', 'cancelada', { cancelada: true, criada: 60 });
  await reuniao('cancelada-viva', 'cancelada', { outcome: 'DONE', criada: 5 });

  // 5. Minutos diferentes não são repetidas.
  await lead('minutos');
  await reuniao('minutos-1', 'minutos', { outcome: 'DONE' });
  await reuniao('minutos-2', 'minutos', { outcome: 'DONE', hora: '21:01' });

  // 6. Mesmo minuto em leads diferentes também não.
  await lead('outro');
  await reuniao('outro', 'outro', { outcome: 'DONE' });

  await runMigrations(url);
});

afterAll(closeTestConnections);

describe('reunião repetida do mesmo lead no mesmo minuto (0094)', () => {
  it('fica a mais antiga; a outra vira cancelada, sem apagar', async () => {
    expect(await estado('igor-antiga')).toEqual({ cancelada: false, version: 1 });
    expect(await estado('igor-nova')).toEqual({ cancelada: true, version: 2 });
  });

  it('a reunião da renda extra da venda e a realizada têm preferência', async () => {
    expect((await estado('venda-nova')).cancelada).toBe(false);
    expect((await estado('venda-antiga')).cancelada).toBe(true);
    expect((await estado('aberta-feita')).cancelada).toBe(false);
    expect((await estado('aberta-sem')).cancelada).toBe(true);
  });

  it('cancelada, outro minuto e outro lead ficam como estavam', async () => {
    expect((await estado('cancelada-viva')).cancelada).toBe(false);
    for (const chave of ['minutos-1', 'minutos-2', 'outro'])
      expect(await estado(chave), chave).toEqual({ cancelada: false, version: 1 });
  });

  it('o valor por reunião realizada do lead do Igor volta a contar uma vez', async () => {
    const [r] = await owner<{ n: number }[]>`
      select count(*)::int as n from meetings
      where lead_id = ${leads.igor!} and outcome = 'DONE' and canceled_at is null`;
    expect(r!.n).toBe(1);
  });

  it('o banco recusa outra reunião do lead no mesmo minuto, mas aceita depois de cancelar', async () => {
    await expect(
      owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
        values (${leads.minutos!}, 'u-sonia', '2026-11-27T21:00:45Z', 'DIRETO', 'u-ale')`,
    ).rejects.toThrow(/meetings_lead_minuto/);
    await owner`update meetings set canceled_at = now() where id = ${reunioes['minutos-1']!}`;
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${leads.minutos!}, 'u-sonia', '2026-11-27T21:00:45Z', 'DIRETO', 'u-ale')`;
  });
});
