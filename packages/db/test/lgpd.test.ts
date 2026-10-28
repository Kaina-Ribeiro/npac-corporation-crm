import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const as = <T extends Record<string, unknown>>(userId: string, q: ReturnType<typeof sql>) =>
  withUser(db, userId, (tx) => tx.execute<T>(q)).then((r) => [...r]);
const asAnon = <T extends Record<string, unknown>>(q: ReturnType<typeof sql>) =>
  db.execute<T>(q).then((r) => [...r]);

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
let stage: string;

beforeEach(async () => {
  await owner`truncate chat_reads, chat_messages, chat_members, lgpd_requests, lead_notes, lead_tasks, lead_timeline, payments, deals, meetings, leads, pipeline_stages, audit_log, products, "user" restart identity cascade`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      ('u-ana', 'Ana', 'ana@npac.test', 'HEAD', true, false),
      ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true, false),
      ('u-sonia', 'Sônia', 'sonia@npac.test', 'CLOSER', false, true)`;
  [{ id: stage }] = (await owner<{ id: string }[]>`
    insert into pipeline_stages (key, label, position) values ('SONDAGEM', 'Sondagem', 1) returning id`) as unknown as [
    { id: string },
  ];
  [{ id: lead }] = (await owner<{ id: string }[]>`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram, phone_bidx, phone_enc, summary)
    values ('Maria Titular', 'R10_20K', 'INSTAGRAM', 'P1', ${stage}, 'u-ale', 'u-ale', 'maria', 'bidx', '\\x01', 'conversa')
    returning id`) as unknown as [{ id: string }];
  await owner`insert into lead_notes (lead_id, body, created_by) values (${lead}, 'telefone pessoal 11999', 'u-ale')`;
});

afterAll(closeTestConnections);

describe('auditoria', () => {
  it('qualquer processo insere; só HEAD lê; ninguém altera', async () => {
    await asAnon(sql`insert into audit_log (action, entity_type) values ('x', 'y')`);
    expect(await as('u-ana', sql`select id from audit_log`)).toHaveLength(1);
    expect(await as('u-ale', sql`select id from audit_log`)).toHaveLength(0);
    expect(await pgError(as('u-ana', sql`delete from audit_log`))).toMatch(/permission denied/);
    expect(await pgError(as('u-ana', sql`update audit_log set action = 'z'`))).toMatch(
      /permission denied/,
    );
  });
});

describe('admin', () => {
  it('só HEAD cria/edita produtos', async () => {
    await as(
      'u-ana',
      sql`insert into products (code, name, closer_id, price_cents) values ('NOVO', 'Novo', 'u-sonia', 1000)`,
    );
    expect(
      await pgError(
        as(
          'u-ale',
          sql`insert into products (code, name, closer_id, price_cents) values ('X', 'X', 'u-sonia', 1000)`,
        ),
      ),
    ).toMatch(/row-level security/);
    expect(await as('u-ale', sql`update products set price_cents = 1 returning id`)).toHaveLength(
      0,
    );
  });

  it('pedidos LGPD só para HEAD', async () => {
    await as(
      'u-ana',
      sql`insert into lgpd_requests (kind, lead_id, description, created_by) values ('ACCESS', ${lead}, 'pedido', 'u-ana')`,
    );
    expect(await as('u-ale', sql`select id from lgpd_requests`)).toHaveLength(0);
    const [r] = await as<{ days: number }>(
      'u-ana',
      sql`select extract(day from due_at - created_at)::int as days from lgpd_requests`,
    );
    expect(r!.days).toBe(15);
  });
});

describe('anonimização', () => {
  it('HEAD anonimiza: some contato e texto livre; auditoria registra', async () => {
    expect(await pgError(as('u-ale', sql`select lgpd_anonymize_lead(${lead}::uuid)`))).toMatch(
      /apenas HEAD/,
    );
    const [r] = await as<{ ok: boolean }>(
      'u-ana',
      sql`select lgpd_anonymize_lead(${lead}::uuid) as ok`,
    );
    expect(r!.ok).toBe(true);
    const [l] = await owner<
      Record<string, unknown>[]
    >`select name, instagram, phone_bidx, phone_enc, summary, deleted_at, anonymized_at from leads where id = ${lead}`;
    expect(l).toMatchObject({
      name: 'Titular anonimizado',
      instagram: null,
      phone_bidx: null,
      phone_enc: null,
      summary: null,
    });
    expect(l!.deleted_at).not.toBeNull();
    const [n] = await owner<
      { body: string }[]
    >`select body from lead_notes where lead_id = ${lead}`;
    expect(n!.body).not.toContain('11999');
    const [a] = await owner<
      { actor_id: string }[]
    >`select actor_id from audit_log where action = 'lgpd.anonymize'`;
    expect(a!.actor_id).toBe('u-ana');
  });

  it('retenção anonimiza excluídos antigos e preserva os recentes', async () => {
    const [{ id: recent }] = (await owner<{ id: string }[]>`
      insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram, deleted_at)
      values ('Recente', 'R5_10K', 'INSTAGRAM', 'P2', ${stage}, 'u-ale', 'u-ale', 'recente', now() - interval '10 days')
      returning id`) as unknown as [{ id: string }];
    await owner`update leads set deleted_at = now() - interval '200 days' where id = ${lead}`;
    const [r] = await owner<{ n: number }[]>`select lgpd_retention(180) as n`;
    expect(r!.n).toBe(1);
    const rows = await owner<
      { id: string; anonymized_at: Date | null }[]
    >`select id, anonymized_at from leads`;
    expect(rows.find((x) => x.id === lead)!.anonymized_at).not.toBeNull();
    expect(rows.find((x) => x.id === recent)!.anonymized_at).toBeNull();
    expect(await pgError(as('u-ana', sql`select lgpd_retention(0)`))).toMatch(/permission denied/);
  });
});
