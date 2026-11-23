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

// NPAC-59 (Igor, 23/11/2026, "A"): venda registrada de um lead em Agendou Pagamento não dava a renda
// extra ao SDR. A 0079 cria a marcação das vendas assim feitas desde 17/11/2026.
const BANCO = 'npac_test_renda_pagamento';
const owner = ownerSql(BANCO);
const MIGRATION = 'renda_extra_agendou_pagamento';

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
const VENDIDA_EM = '2026-11-22T15:00:00.000Z';

let padrao: string;
let venda: string;
let pagamento: string;
let follow: string;
let reuniaoRecente: string;
const leads: Record<string, string> = {};

/**
 * Lead do Ale em Venda com a venda registrada pela Ana, vinda de `anterior` (Agendou Pagamento por
 * padrão), com uma reunião realizada da Sônia antes da venda (ou nenhuma).
 */
async function vendaRegistrada(
  nome: string,
  { anterior = pagamento, reuniao = true, quando = VENDIDA_EM } = {},
) {
  const lead = await id(owner`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, closer_id, created_by, instagram)
    values (${nome}, 'R8_15K', 'BIO', 'P1', ${venda}, 'u-ale', 'u-sonia', 'u-ale', ${nome}) returning id`);
  if (reuniao)
    await owner`
      insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, outcome, outcome_at)
      values (${lead}, 'u-sonia', '2026-11-20T14:00:00Z', 'DIRETO', 'u-ale', 'DONE', '2026-11-20T14:00:00Z')`;
  const deal = await id(owner`
    insert into deals (lead_id, product_id, product_name, catalog_price_cents, closer_id, sdr_id,
      total_cents, method, request_key, request_hash, created_by, previous_stage_id, closed_at)
    values (${lead}, ${padrao}, 'Nação Padrão', 300000, 'u-sonia', 'u-ale', 300000, 'PIX',
      gen_random_uuid(), 'h', 'u-ana', ${anterior}, ${quando}) returning id`);
  leads[nome] = lead;
  return { lead, deal };
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
  [venda, pagamento, follow] = (await Promise.all(
    [
      ['VENDA', 'Venda Fechada', 1],
      ['AGENDOU_PAGAMENTO', 'Agendou Pagamento', 2],
      ['EM_FOLLOW', 'Em follow', 3],
    ].map(([key, label, position]) =>
      id(owner`insert into pipeline_stages (key, label, position)
        values (${key as string}, ${label as string}, ${position as number}) returning id`),
    ),
  )) as [string, string, string];
  padrao = await id(owner`
    insert into products (code, name, closer_id, price_cents, sdr_bonus_cents)
    values ('NACAO_PADRAO', 'Nação Padrão', 'u-sonia', 300000, 1000) returning id`);

  // 1. O caso do Igor: SDR agendou o pagamento, a liderança registrou a venda.
  const igor = await vendaRegistrada('igor');
  reuniaoRecente = await id(owner`
    insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, outcome, outcome_at)
    values (${igor.lead}, 'u-sonia', '2026-11-21T14:00:00Z', 'DIRETO', 'u-ale', 'DONE',
      '2026-11-21T14:00:00Z') returning id`);
  // Reunião depois da venda não conta.
  await owner`
    insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, outcome, outcome_at)
    values (${igor.lead}, 'u-sonia', '2026-11-23T14:00:00Z', 'DIRETO', 'u-ale', 'DONE', '2026-11-23T14:00:00Z')`;

  // 2. Registro direto, sem Agendou Pagamento: continua sem renda (17/11, "2B").
  await vendaRegistrada('direta', { anterior: follow });

  // 3. Sem reunião realizada: fica de fora, como na API.
  await vendaRegistrada('sem-reuniao', { reuniao: false });

  // 4. Estornada.
  const estornada = await vendaRegistrada('estornada');
  await owner`update deals set reversed_at = now(), reversed_by = 'u-ana' where id = ${estornada.deal}`;

  // 5. Antes da renda extra existir (16/11).
  await vendaRegistrada('antes', { quando: '2026-11-16T15:00:00Z' });

  // 6. Já tem marcação ativa.
  const marcada = await vendaRegistrada('ja-marcada');
  const [m] = await owner<
    { id: string }[]
  >`select id from meetings where lead_id = ${marcada.lead}`;
  await owner`insert into sdr_sale_marks (lead_id, sdr_id, product_id, meeting_id, bonus_cents, marked_by)
    values (${marcada.lead}, 'u-ale', ${padrao}, ${m!.id}, 500, 'u-ale')`;

  await runMigrations(url);
});

afterAll(closeTestConnections);

describe('renda extra das vendas vindas de Agendou Pagamento (0079)', () => {
  it('cria a marcação do SDR do lead, com a reunião anterior à venda, a data e quem registrou', async () => {
    const [m, ...resto] = await marcacoes('igor');
    expect(resto).toEqual([]);
    expect(m).toMatchObject({
      sdr: 'u-ale',
      produto: padrao,
      reuniao: reuniaoRecente,
      cents: 1000,
      por: 'u-ana',
      cancelada: null,
    });
    expect(m!.em.toISOString()).toBe(VENDIDA_EM);
  });

  it('venda direta, sem reunião, estornada ou de antes de 17/11 não ganha marcação', async () => {
    for (const nome of ['direta', 'sem-reuniao', 'estornada', 'antes'])
      expect(await marcacoes(nome), nome).toEqual([]);
  });

  it('quem já tinha marcação fica como estava', async () => {
    expect((await marcacoes('ja-marcada')).map((m) => m.cents)).toEqual([500]);
  });
});
