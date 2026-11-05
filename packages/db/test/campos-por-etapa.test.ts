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
  await owner`truncate chat_reads, chat_messages, chat_members, lgpd_requests, lead_notes, lead_tasks, lead_timeline, payments, deals, meetings, leads, pipeline_stages, audit_log, products, "user" restart identity cascade`;
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
  it('produto e valor andam juntos e o valor é positivo', async () => {
    expect(
      await pgError(owner`update leads set payment_product_id = ${product} where id = ${lead}`),
    ).toMatch(/leads_payment_check/);
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
