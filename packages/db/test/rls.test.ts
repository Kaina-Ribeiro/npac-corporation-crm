import { eq } from 'drizzle-orm';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { leads, meetings } from '../src/schema/index.js';
import { appDb, appSql, closeTestConnections, ownerSql } from '../src/testing.js';
import { leadContactTaken, withUser } from '../src/with-user.js';

const DB = 'npac_test_db';

const owner = ownerSql(DB);
const db = appDb(DB);
const app = appSql(DB);

type Fixture = { id: string };
const ana: Fixture = { id: 'u-ana' };
const ronaldo: Fixture = { id: 'u-ronaldo' };
const ale: Fixture = { id: 'u-ale' };
const murilo: Fixture = { id: 'u-murilo' };
const sonia: Fixture = { id: 'u-sonia' };

let A: string;
let M: string;
let meetingA: string;
let stageId: string;
const bidxOfM = 'bidx-murilo-lead';

const sorted = (ids: string[]) => [...ids].sort();

function idOf(rows: { id: string }[]): string {
  const id = rows[0]?.id;
  if (!id) throw new Error('fixture insert não retornou id');
  return id;
}

/** O drizzle embrulha o erro do Postgres em DrizzleQueryError; expõe o original. */
async function pgError<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    throw e instanceof Error && e.cause instanceof Error ? e.cause : e;
  }
}

async function seedFixtures(): Promise<void> {
  await owner`truncate meetings, leads, pipeline_stages, audit_log, "user" restart identity cascade`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      ('u-ana', 'Ana', 'ana@npac.test', 'HEAD', false, false),
      ('u-ronaldo', 'Ronaldo', 'ronaldo@npac.test', 'HEAD', false, true),
      ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true, false),
      ('u-murilo', 'Murilo', 'murilo@npac.test', 'SDR', true, false),
      ('u-sonia', 'Sônia', 'sonia@npac.test', 'CLOSER', false, true)`;
  stageId = idOf(
    await owner<{ id: string }[]>`
    insert into pipeline_stages (key, label, position) values ('SONDAGEM', 'Sondagem', 1) returning id`,
  );
  A = idOf(
    await owner<{ id: string }[]>`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram)
    values ('Lead A', 'R10_20K', 'INSTAGRAM', 'P1', ${stageId}, 'u-ale', 'u-ale', 'lead_a') returning id`,
  );
  M = idOf(
    await owner<{ id: string }[]>`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, phone_bidx)
    values ('Lead M', 'R5_10K', 'WHATSAPP', 'P2', ${stageId}, 'u-murilo', 'u-murilo', ${bidxOfM}) returning id`,
  );
  meetingA = idOf(
    await owner<{ id: string }[]>`
    insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
    values (${A}, 'u-sonia', now() + interval '1 day', 'DIRETO', 'u-ale') returning id`,
  );
}

async function visibleLeadIds(u: Fixture): Promise<string[]> {
  const rows = await withUser(db, u.id, (tx) => tx.select({ id: leads.id }).from(leads));
  return sorted(rows.map((r) => r.id));
}

async function cancelMeeting(id: string): Promise<void> {
  await owner`update meetings set canceled_at = now() where id = ${id}`;
}

async function reassignMeeting(id: string, to: Fixture): Promise<void> {
  await owner`update meetings set closer_id = ${to.id} where id = ${id}`;
}

async function deactivate(u: Fixture): Promise<void> {
  await owner`update "user" set active = false where id = ${u.id}`;
}

async function insertLeadAs(u: Fixture, data: { sdrId: string }): Promise<void> {
  await pgError(
    withUser(db, u.id, (tx) =>
      tx.insert(leads).values({
        name: 'Novo',
        incomeBand: 'R10_20K',
        source: 'INDICACAO',
        tier: 'P0',
        stageId,
        sdrId: data.sdrId,
        createdBy: u.id,
      }),
    ),
  );
}

async function updateNameAs(u: Fixture, leadId: string, name: string): Promise<number> {
  const rows = await withUser(db, u.id, (tx) =>
    tx.update(leads).set({ name }).where(eq(leads.id, leadId)).returning({ id: leads.id }),
  );
  return rows.length;
}

beforeEach(async () => {
  await seedFixtures();
});

afterAll(async () => {
  await closeTestConnections();
});

describe('row-level security', () => {
  it('HEAD vê todos', async () => expect(await visibleLeadIds(ana)).toEqual(sorted([A, M])));

  it('SDR vê só os seus', async () => expect(await visibleLeadIds(ale)).toEqual([A]));

  it('closer vê só quem está na agenda', async () =>
    expect(await visibleLeadIds(sonia)).toEqual([A]));

  it('reunião cancelada tira o lead da Sônia', async () => {
    await cancelMeeting(meetingA);
    expect(await visibleLeadIds(sonia)).toEqual([]);
  });

  it('reunião passada para Ronaldo tira o lead da Sônia', async () => {
    await reassignMeeting(meetingA, ronaldo);
    expect(await visibleLeadIds(sonia)).toEqual([]);
  });

  it('SDR não cria lead em nome de outro', async () =>
    await expect(insertLeadAs(ale, { sdrId: murilo.id })).rejects.toThrow(/row-level security/));

  it('SDR cria lead em nome próprio', async () => {
    await insertLeadAs(ale, { sdrId: ale.id });
    expect(await visibleLeadIds(ale)).toHaveLength(2);
  });

  it('SDR não altera lead alheio', async () => expect(await updateNameAs(ale, M, 'x')).toBe(0));

  it('SDR não transfere o próprio lead para outro SDR', async () => {
    const attempt = pgError(
      withUser(db, ale.id, (tx) =>
        tx.update(leads).set({ sdrId: murilo.id }).where(eq(leads.id, A)),
      ),
    );
    await expect(attempt).rejects.toThrow(/row-level security|só HEAD/);
    const [row] = await owner<{ sdr_id: string }[]>`select sdr_id from leads where id = ${A}`;
    expect(row?.sdr_id).toBe(ale.id);
  });

  it('lead excluído some para SDR mas não para HEAD', async () => {
    await owner`update leads set deleted_at = now() where id = ${A}`;
    expect(await visibleLeadIds(ale)).toEqual([]);
    expect(await visibleLeadIds(ana)).toContain(A);
  });

  it('usuário inativo não vê nada', async () => {
    await deactivate(ale);
    expect(await visibleLeadIds(ale)).toEqual([]);
  });

  it('lead_contact_taken enxerga leads de outros SDRs', async () =>
    expect(await withUser(db, ale.id, (tx) => leadContactTaken(tx, bidxOfM, null))).toBe(true));

  it('lead_contact_taken ignora leads excluídos', async () => {
    await owner`update leads set deleted_at = now() where id = ${M}`;
    expect(await withUser(db, ale.id, (tx) => leadContactTaken(tx, bidxOfM, null))).toBe(false);
    expect(await withUser(db, ale.id, (tx) => leadContactTaken(tx, null, 'lead_a'))).toBe(true);
  });

  it('audit_log é só-inserção', async () => {
    await app`insert into audit_log (action, entity_type) values ('login', 'user')`;
    await expect(app`update audit_log set action='x'`).rejects.toThrow(/permission denied/);
    await expect(app`delete from audit_log`).rejects.toThrow(/permission denied/);
  });

  it('sem app.user_id não vê nada', async () => expect(await db.select().from(leads)).toEqual([]));

  it('closer vê a reunião da agenda e SDR vê a reunião do próprio lead', async () => {
    const meetingsOf = (u: Fixture) =>
      withUser(db, u.id, (tx) => tx.select({ id: meetings.id }).from(meetings));
    expect((await meetingsOf(sonia)).map((r) => r.id)).toEqual([meetingA]);
    expect((await meetingsOf(ale)).map((r) => r.id)).toEqual([meetingA]);
    expect((await meetingsOf(murilo)).map((r) => r.id)).toEqual([]);
  });
});

type TxSql = TransactionSql<Record<string, never>>;

describe('escritas que não podem ampliar visibilidade', () => {
  /** Roda `stmt` como `u` (npac_app + app.user_id); resolve com o nº de linhas afetadas. */
  const asUser = (u: Fixture, stmt: (s: TxSql) => PromiseLike<readonly unknown[]>) =>
    app.begin(async (s) => {
      await s`select set_config('app.user_id', ${u.id}, true)`;
      return (await stmt(s)).length;
    });

  const newMeeting =
    (closerId: string, createdBy: string, leadId = A) =>
    (s: TxSql) =>
      s`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${leadId}, ${closerId}, now() + interval '2 days', 'DIRETO', ${createdBy}) returning id`;

  it('SDR agenda reunião do próprio lead com closer', async () =>
    expect(await asUser(ale, newMeeting(sonia.id, ale.id))).toBe(1));

  it('closer não repassa a reunião para outro lead', async () => {
    await expect(
      asUser(
        sonia,
        (s) => s`update meetings set lead_id = ${M} where id = ${meetingA} returning id`,
      ),
    ).rejects.toThrow();
    expect(await visibleLeadIds(sonia)).toEqual([A]);
  });

  it('SDR não repassa reunião para lead alheio se colocando como closer', async () => {
    await expect(
      asUser(
        ale,
        (s) =>
          s`update meetings set lead_id = ${M}, closer_id = ${ale.id} where id = ${meetingA} returning id`,
      ),
    ).rejects.toThrow();
    expect(await visibleLeadIds(ale)).toEqual([A]);
  });

  it('SDR não entrega lead a quem não é closer', async () => {
    await expect(asUser(ale, newMeeting(murilo.id, ale.id))).rejects.toThrow(/row-level security/);
    expect(await visibleLeadIds(murilo)).toEqual([M]);
  });

  it('created_by da reunião é sempre quem agenda', async () =>
    await expect(asUser(ale, newMeeting(sonia.id, ana.id))).rejects.toThrow(/row-level security/));

  it('closer não agenda reunião', async () =>
    await expect(asUser(sonia, newMeeting(sonia.id, sonia.id))).rejects.toThrow(
      /row-level security/,
    ));

  it('closer não desfaz cancelamento', async () => {
    await cancelMeeting(meetingA);
    const undo = asUser(
      sonia,
      (s) => s`update meetings set canceled_at = null where id = ${meetingA} returning id`,
    );
    await expect(undo.catch(() => 0)).resolves.toBe(0);
    expect(await visibleLeadIds(sonia)).toEqual([]);
  });

  it('closer não passa a reunião para outro closer', async () => {
    await expect(
      asUser(
        sonia,
        (s) => s`update meetings set closer_id = ${ronaldo.id} where id = ${meetingA} returning id`,
      ),
    ).rejects.toThrow();
  });

  it('closer remarca a reunião (só horário)', async () =>
    expect(
      await asUser(
        sonia,
        (s) =>
          s`update meetings set scheduled_at = now() + interval '3 days' where id = ${meetingA} returning id`,
      ),
    ).toBe(1));

  it('closer não troca o SDR do lead', async () => {
    await expect(
      asUser(sonia, (s) => s`update leads set sdr_id = ${murilo.id} where id = ${A} returning id`),
    ).rejects.toThrow();
    const [row] = await owner<{ sdr_id: string }[]>`select sdr_id from leads where id = ${A}`;
    expect(row?.sdr_id).toBe(ale.id);
  });

  it('só HEAD exclui lead', async () => {
    await expect(
      asUser(ale, (s) => s`update leads set deleted_at = now() where id = ${A} returning id`),
    ).rejects.toThrow();
    expect(
      await asUser(ana, (s) => s`update leads set deleted_at = now() where id = ${A} returning id`),
    ).toBe(1);
  });

  it('HEAD troca o SDR do lead', async () =>
    expect(
      await asUser(
        ana,
        (s) => s`update leads set sdr_id = ${murilo.id} where id = ${A} returning id`,
      ),
    ).toBe(1));

  it('lead_contact_taken não responde sem usuário', async () => {
    const [r] = await app<
      { taken: boolean }[]
    >`select lead_contact_taken(${bidxOfM}, null) as taken`;
    expect(r?.taken).toBe(false);
  });

  it('closer não vê reunião cancelada', async () => {
    await cancelMeeting(meetingA);
    const rows = await withUser(db, sonia.id, (tx) =>
      tx.select({ id: meetings.id }).from(meetings),
    );
    expect(rows).toEqual([]);
  });
});
