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

// NPAC-51 (Gabriel, 18/11/2026, "1B"): venda a registrar feita antes da renda extra do SDR (0066)
// ficou sem marcação e não aparecia no painel. A 0067 cria a marcação com a data original.
const BANCO = 'npac_test_renda_antiga';
const owner = ownerSql(BANCO);
const MIGRATION = 'renda_extra_vendas_antigas';

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
const MARCADA_EM = '2026-11-10T15:00:00.000Z';

let promo: string;
let venda: string;
let reuniaoRecente: string;
const leads: Record<string, string> = {};

/** Lead do Ale em Venda Fechada, a registrar, com uma reunião realizada da Sônia. */
async function vendaARegistrar(nome: string, produto: string | null) {
  const lead = await id(owner`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, closer_id, created_by,
      instagram, sold_product_id)
    values (${nome}, 'R8_15K', 'BIO', 'P1', ${venda}, 'u-ale', 'u-sonia', 'u-ale', ${nome},
      ${produto}) returning id`);
  const reuniao = await id(owner`
    insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, outcome, outcome_at)
    values (${lead}, 'u-sonia', '2026-11-10T14:00:00Z', 'DIRETO', 'u-ale', 'DONE',
      '2026-11-10T14:00:00Z') returning id`);
  leads[nome] = lead;
  return { lead, reuniao };
}

const marcacoes = (nome: string) =>
  owner<
    {
      sdr: string;
      produto: string;
      reuniao: string;
      cents: number;
      por: string;
      em: Date;
      cancelada: Date | null;
    }[]
  >`select sdr_id as sdr, product_id as produto, meeting_id as reuniao, bonus_cents as cents,
      marked_by as por, marked_at as em, canceled_at as cancelada
    from sdr_sale_marks where lead_id = ${leads[nome]!}`;

beforeAll(async () => {
  const url = await createEmptyTestDb(BANCO);
  await migrarAteAntes(url);
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      ('u-ana', 'Ana', 'ana@npac.test', 'HEAD', true, false),
      ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true, false),
      ('u-sonia', 'Sônia', 'sonia@npac.test', 'CLOSER', false, true)`;
  venda = await id(owner`
    insert into pipeline_stages (key, label, position) values ('VENDA', 'Venda Fechada', 1)
    returning id`);
  promo = await id(owner`
    insert into products (code, name, closer_id, price_cents, sdr_bonus_cents)
    values ('NACAO_PROMO', 'Nação Promocional', 'u-sonia', 250000, 500) returning id`);

  // 1. O caso do Igor: marcada antes da renda extra, com duas reuniões realizadas.
  const antiga = await vendaARegistrar('antiga', promo);
  reuniaoRecente = await id(owner`
    insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, outcome, outcome_at)
    values (${antiga.lead}, 'u-sonia', '2026-11-12T14:00:00Z', 'DIRETO', 'u-ale', 'DONE',
      '2026-11-12T14:00:00Z') returning id`);
  await owner`insert into lead_timeline (lead_id, actor_id, kind, at)
    values (${antiga.lead}, 'u-ana', 'sale.pending', ${MARCADA_EM})`;

  // 2. Sem o registro de quando foi marcada.
  await vendaARegistrar('sem-evento', promo);

  // 3. Já tem a marcação (feita depois da 0066): fica como está.
  const marcada = await vendaARegistrar('ja-marcada', promo);
  await owner`insert into sdr_sale_marks (lead_id, sdr_id, product_id, meeting_id, bonus_cents, marked_by)
    values (${marcada.lead}, 'u-ale', ${promo}, ${marcada.reuniao}, 1000, 'u-ale')`;

  // 4. Venda registrada pelo closer, sem marcação: não gera renda (Igor, 17/11, "2B").
  const registrada = await vendaARegistrar('registrada', null);
  await owner`insert into deals
    (lead_id, product_id, product_name, catalog_price_cents, closer_id, sdr_id, total_cents,
     method, request_key, request_hash, created_by)
    values (${registrada.lead}, ${promo}, 'Nação Promocional', 250000, 'u-sonia', 'u-ale', 250000,
      'PIX', gen_random_uuid(), 'h', 'u-sonia')`;

  // 5. Sem o produto informado (cadastro anterior ao NPAC-41): não há valor a dar.
  await vendaARegistrar('sem-produto', null);

  // 6. Lead excluído.
  const excluida = await vendaARegistrar('excluida', promo);
  await owner`update leads set deleted_at = now() where id = ${excluida.lead}`;

  await runMigrations(url);
});

afterAll(closeTestConnections);

describe('renda extra das vendas a registrar antigas (0067)', () => {
  it('cria a marcação do SDR do lead com o valor do produto e a data em que foi marcada', async () => {
    const [m, ...resto] = await marcacoes('antiga');
    expect(resto).toEqual([]);
    expect(m).toMatchObject({
      sdr: 'u-ale',
      produto: promo,
      reuniao: reuniaoRecente,
      cents: 500,
      por: 'u-ana',
      cancelada: null,
    });
    expect(m!.em.toISOString()).toBe(MARCADA_EM);
  });

  it('sem o registro de quando foi marcada, conta na data da correção, pelo SDR do lead', async () => {
    const [m, ...resto] = await marcacoes('sem-evento');
    expect(resto).toEqual([]);
    expect(m).toMatchObject({ sdr: 'u-ale', cents: 500, por: 'u-ale', cancelada: null });
    expect(Date.now() - m!.em.getTime()).toBeLessThan(5 * 60_000);
  });

  it('quem já tinha marcação fica como estava', async () => {
    const ms = await marcacoes('ja-marcada');
    expect(ms.map((m) => m.cents)).toEqual([1000]);
  });

  it('venda registrada, lead sem produto e lead excluído não ganham marcação', async () => {
    expect(await marcacoes('registrada')).toEqual([]);
    expect(await marcacoes('sem-produto')).toEqual([]);
    expect(await marcacoes('excluida')).toEqual([]);
  });
});
