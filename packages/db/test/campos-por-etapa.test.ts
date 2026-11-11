import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// Campos por etapa (NPAC-38, pedido do cliente de 05/11/2026): pagamento combinado e motivo do
// Sem Perfil ficam no lead; o closer grava junto com a etapa; a LGPD apaga o texto do motivo.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const as = (userId: string, q: ReturnType<typeof sql>) =>
  withUser(db, userId, (tx) => tx.execute(q)).then((r) => [...r]);

async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error && e.cause instanceof Error ? e.cause : (e as Error);
    return err.message;
  }
  throw new Error('esperava erro');
}

let lead: string;
let sondagem: string;
let pagamento: string;
let perdido: string;
let product: string;

beforeEach(async () => {
  await owner`truncate chat_reads, chat_messages, chat_members, lgpd_requests, lead_notes, lead_tasks, lead_timeline, payments, deals, meetings, form_responses, leads, pipeline_stages, audit_log, products, "user" restart identity cascade`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      ('u-ana', 'Ana', 'ana@npac.test', 'HEAD', true, false),
      ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true, false),
      ('u-sonia', 'Sônia', 'sonia@npac.test', 'CLOSER', false, true)`;
  const stages = await owner<{ id: string; key: string }[]>`
    insert into pipeline_stages (key, label, position) values
      ('SONDAGEM', 'Sondagem', 1), ('AGENDOU_PAGAMENTO', 'Agendou pagamento', 2),
      ('PERDIDO', 'Sem perfil', 3)
    returning id, key`;
  const byKey = (k: string) => stages.find((s) => s.key === k)!.id;
  [sondagem, pagamento, perdido] = [
    byKey('SONDAGEM'),
    byKey('AGENDOU_PAGAMENTO'),
    byKey('PERDIDO'),
  ];
  [{ id: product }] = (await owner<{ id: string }[]>`
    insert into products (code, name, closer_id, price_cents)
    values ('RDV', 'Rico de Verdade', 'u-sonia', 500000) returning id`) as unknown as [
    { id: string },
  ];
  [{ id: lead }] = (await owner<{ id: string }[]>`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram)
    values ('Maria', 'R8_15K', 'BIO', 'P1', ${sondagem}, 'u-ale', 'u-ale', 'maria') returning id`) as unknown as [
    { id: string },
  ];
  // Closer só enxerga o lead com reunião dele na agenda.
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
    values (${lead}, 'u-sonia', now() - interval '1 hour', 'DIRETO', 'u-ale')`;
});

afterAll(closeTestConnections);

describe('motivo do Sem Perfil', () => {
  it('texto só com OUTRO, de 1 a 80 caracteres', async () => {
    await owner`update leads set stage_id = ${perdido}, lost_reason = 'SEM_RENDA' where id = ${lead}`;
    expect(
      await pgError(owner`update leads set lost_reason_other = 'x' where id = ${lead}`),
    ).toMatch(/leads_lost_reason_other_check/);
    await owner`update leads set lost_reason = 'OUTRO', lost_reason_other = 'mudou de cidade' where id = ${lead}`;
    expect(
      await pgError(
        owner`update leads set lost_reason_other = ${'a'.repeat(81)} where id = ${lead}`,
      ),
    ).toMatch(/leads_lost_reason_other_check/);
    expect(
      await pgError(owner`update leads set lost_reason = 'QUALQUER' where id = ${lead}`),
    ).toMatch(/lead_lost_reason/);
  });
});

describe('pagamento combinado', () => {
  it('valor exige produto e é positivo; produto sem valor é o pagamento a completar', async () => {
    expect(
      await pgError(owner`update leads set payment_amount_cents = 450000 where id = ${lead}`),
    ).toMatch(/leads_payment_check/);
    await owner`update leads set payment_product_id = ${product} where id = ${lead}`;
    expect(
      await pgError(
        owner`update leads set payment_product_id = ${product}, payment_amount_cents = 0 where id = ${lead}`,
      ),
    ).toMatch(/leads_payment_check/);
    await owner`update leads set payment_product_id = ${product}, payment_amount_cents = 450000 where id = ${lead}`;
  });
});

describe('closer marca a etapa com os dados dela', () => {
  it('grava pagamento e data junto da etapa', async () => {
    await as(
      'u-sonia',
      sql`update leads set stage_id = ${pagamento}, payment_product_id = ${product},
        payment_amount_cents = 450000, next_contact_at = now() + interval '2 days' where id = ${lead}`,
    );
    const [l] = await owner<
      { payment_amount_cents: number }[]
    >`select payment_amount_cents from leads where id = ${lead}`;
    expect(l!.payment_amount_cents).toBe(450000);
  });

  it('grava o motivo junto da etapa', async () => {
    await as(
      'u-sonia',
      sql`update leads set stage_id = ${perdido}, lost_reason = 'OUTRO',
        lost_reason_other = 'sem tempo', next_contact_at = null where id = ${lead}`,
    );
    const [l] = await owner<
      { lost_reason: string }[]
    >`select lost_reason from leads where id = ${lead}`;
    expect(l!.lost_reason).toBe('OUTRO');
  });

  it('sem trocar a etapa, continua sem mexer nesses campos nem nos pessoais', async () => {
    expect(
      await pgError(
        as(
          'u-sonia',
          sql`update leads set next_contact_at = now() + interval '1 day' where id = ${lead}`,
        ),
      ),
    ).toMatch(/closer só pode mover a etapa/);
    expect(
      await pgError(
        as(
          'u-sonia',
          sql`update leads set stage_id = ${perdido}, name = 'Outra' where id = ${lead}`,
        ),
      ),
    ).toMatch(/closer só pode mover a etapa/);
  });
});

// Item 13 do Igor (10/11/2026, "2A", "3A"): o SDR informa produto, closer e se já pagou entrada; o
// closer do lead enxerga o lead nessa etapa mesmo sem reunião e completa valor, entrada e data.
describe('pagamento do SDR', () => {
  const visible = (userId: string) =>
    as(userId, sql`select id from leads`).then((rows) => rows.map((r) => r.id));
  const toPayment = () =>
    owner`update leads set stage_id = ${pagamento}, payment_product_id = ${product},
      closer_id = 'u-sonia' where id = ${lead}`;

  beforeEach(async () => {
    await owner`insert into "user" (id, name, email, role, can_prospect, can_close) values
      ('u-carla', 'Carla', 'carla@npac.test', 'CLOSER', false, true),
      ('u-fora', 'Fora', 'fora@npac.test', 'SDR', true, false)`;
    await owner`delete from meetings`;
  });

  it('o campo nasce falso', async () => {
    const [l] = await owner<
      { payment_entry_paid: boolean }[]
    >`select payment_entry_paid from leads where id = ${lead}`;
    expect(l!.payment_entry_paid).toBe(false);
  });

  it('closer do lead enxerga sem reunião só em Agendou Pagamento', async () => {
    expect(await visible('u-sonia')).toEqual([]);
    await owner`update leads set closer_id = 'u-sonia' where id = ${lead}`;
    expect(await visible('u-sonia')).toEqual([]);
    await toPayment();
    expect(await visible('u-sonia')).toEqual([lead]);
    expect(await visible('u-carla')).toEqual([]);
    await owner`update leads set stage_id = ${perdido}, payment_product_id = null where id = ${lead}`;
    expect(await visible('u-sonia')).toEqual([]);
  });

  it('closer do lead que registrou a venda continua vendo o lead fora da etapa', async () => {
    await owner.begin(async (t) => {
      const [{ id: deal }] = (await t`insert into deals
        (lead_id, product_id, product_name, catalog_price_cents, closer_id, sdr_id, total_cents,
         method, request_key, request_hash, created_by)
        values (${lead}, ${product}, 'Rico de Verdade', 500000, 'u-sonia', 'u-ale', 500000, 'PIX',
          gen_random_uuid(), 'h', 'u-sonia') returning id`) as unknown as [{ id: string }];
      await t`insert into payments (deal_id, amount_cents, due_at, paid_at, paid_by, receipt_key)
        values (${deal}, 500000, now(), now(), 'u-sonia', gen_random_uuid())`;
    });
    // Só a venda não abre o lead: sem ser o closer dele e sem reunião, continua invisível.
    expect(await visible('u-sonia')).toEqual([]);
    await owner`update leads set closer_id = 'u-sonia' where id = ${lead}`;
    expect(await visible('u-sonia')).toEqual([lead]);
    expect(await visible('u-carla')).toEqual([]);
    await owner`update deals set reversed_at = now(), reversed_by = 'u-ana'`;
    expect(await visible('u-sonia')).toEqual([]);
  });

  it('closer do lead completa valor, entrada, data e a marca sem trocar a etapa', async () => {
    await toPayment();
    await as(
      'u-sonia',
      sql`update leads set payment_amount_cents = 450000, payment_entry_cents = 100000,
        payment_entry_paid = true, next_contact_at = now() + interval '2 days' where id = ${lead}`,
    );
    const [l] = await owner<
      { payment_amount_cents: number; payment_entry_paid: boolean }[]
    >`select payment_amount_cents, payment_entry_paid from leads where id = ${lead}`;
    expect(l).toEqual({ payment_amount_cents: 450000, payment_entry_paid: true });
  });

  it('depois de completado, o closer não mexe mais no valor', async () => {
    await toPayment();
    await owner`update leads set payment_amount_cents = 450000 where id = ${lead}`;
    expect(
      await pgError(
        as('u-sonia', sql`update leads set payment_amount_cents = 1 where id = ${lead}`),
      ),
    ).toMatch(/closer só pode mover a etapa/);
  });

  it('só o closer do lead completa, e só o pagamento', async () => {
    await toPayment();
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${lead}, 'u-carla', now() - interval '1 hour', 'DIRETO', 'u-ale')`;
    expect(
      await pgError(
        as('u-carla', sql`update leads set payment_amount_cents = 1 where id = ${lead}`),
      ),
    ).toMatch(/closer só pode mover a etapa/);
    expect(
      await pgError(
        as(
          'u-sonia',
          sql`update leads set payment_amount_cents = 1, name = 'Outra' where id = ${lead}`,
        ),
      ),
    ).toMatch(/closer só pode mover a etapa/);
    expect(
      await pgError(
        as('u-sonia', sql`update leads set payment_product_id = null where id = ${lead}`),
      ),
    ).toMatch(/closer só pode mover a etapa/);
  });

  it('fora de Agendou Pagamento o closer continua sem completar nada', async () => {
    await owner`update leads set closer_id = 'u-sonia' where id = ${lead}`;
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${lead}, 'u-sonia', now() - interval '1 hour', 'DIRETO', 'u-ale')`;
    expect(
      await pgError(
        as(
          'u-sonia',
          sql`update leads set next_contact_at = now() + interval '1 day' where id = ${lead}`,
        ),
      ),
    ).toMatch(/closer só pode mover a etapa/);
  });

  it('closer sem reunião tira o lead da etapa e o perde', async () => {
    await toPayment();
    await as(
      'u-sonia',
      sql`update leads set stage_id = ${perdido}, payment_product_id = null,
        lost_reason = 'SEM_INTERESSE' where id = ${lead}`,
    );
    const [l] = await owner<{ stage_id: string }[]>`select stage_id from leads where id = ${lead}`;
    expect(l!.stage_id).toBe(perdido);
    expect(await visible('u-sonia')).toEqual([]);
  });

  it('SDR escolhe o closer só com o pagamento a completar', async () => {
    await as(
      'u-ale',
      sql`update leads set stage_id = ${pagamento}, payment_product_id = ${product},
        closer_id = 'u-sonia' where id = ${lead}`,
    );
    await as('u-ale', sql`update leads set closer_id = 'u-carla' where id = ${lead}`);
    const [l] = await owner<
      { closer_id: string }[]
    >`select closer_id from leads where id = ${lead}`;
    expect(l!.closer_id).toBe('u-carla');
    // Quem não fecha venda não vira closer do lead.
    expect(
      await pgError(as('u-ale', sql`update leads set closer_id = 'u-fora' where id = ${lead}`)),
    ).toMatch(/só HEAD altera/);
    await owner`update leads set payment_amount_cents = 450000 where id = ${lead}`;
    expect(
      await pgError(as('u-ale', sql`update leads set closer_id = 'u-sonia' where id = ${lead}`)),
    ).toMatch(/só HEAD altera/);
  });

  it('SDR não escolhe closer fora da etapa, e o closer não troca o dele', async () => {
    expect(
      await pgError(as('u-ale', sql`update leads set closer_id = 'u-sonia' where id = ${lead}`)),
    ).toMatch(/só HEAD altera/);
    await toPayment();
    expect(
      await pgError(as('u-sonia', sql`update leads set closer_id = 'u-carla' where id = ${lead}`)),
    ).toMatch(/closer só pode mover a etapa/);
  });

  it('payment.pending entra na timeline e avisa o closer do lead', async () => {
    await toPayment();
    await as(
      'u-ale',
      sql`insert into lead_timeline (lead_id, actor_id, kind) values (${lead}, 'u-ale', 'payment.pending')`,
    );
    const rows = await owner<{ user_id: string }[]>`select user_id from notifications`;
    expect(rows.map((r) => r.user_id)).toEqual(['u-sonia']);
  });
});

describe('LGPD', () => {
  it('anonimizar apaga o texto do motivo', async () => {
    await owner`update leads set stage_id = ${perdido}, lost_reason = 'OUTRO', lost_reason_other = 'conta pessoal' where id = ${lead}`;
    await as('u-ana', sql`select lgpd_anonymize_lead(${lead}::uuid)`);
    const [l] = await owner<
      { lost_reason: string; lost_reason_other: string | null }[]
    >`select lost_reason, lost_reason_other from leads where id = ${lead}`;
    expect(l).toEqual({ lost_reason: 'OUTRO', lost_reason_other: null });
  });
});
