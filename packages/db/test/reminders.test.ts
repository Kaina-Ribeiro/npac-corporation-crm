import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

let lead: string;
let meeting: string;
const at = new Date('2030-01-10T15:00:00Z');
const min = (n: number) => new Date(at.getTime() - n * 60_000);

function as<T extends Record<string, unknown>>(userId: string, q: ReturnType<typeof sql>) {
  return withUser(db, userId, (tx) => tx.execute<T>(q)).then((r) => [...r]);
}
const claim = (now: Date) =>
  db
    .execute<{ meeting_id: string; step: string; sdr_id: string; lead_name: string }>(
      sql`select * from meeting_reminder_claim(${now.toISOString()}::timestamptz)`,
    )
    .then((r) => [...r]);
const next = (now: Date) =>
  db
    .execute<{ at: Date | null }>(
      sql`select meeting_reminder_next(${now.toISOString()}::timestamptz) as at`,
    )
    .then((r) => (r[0]!.at ? new Date(r[0]!.at) : null));

async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error && e.cause instanceof Error ? e.cause : (e as Error);
    return err.message;
  }
  throw new Error('esperava erro');
}

beforeEach(async () => {
  await owner`truncate push_subscriptions, meeting_reminders_sent, meeting_confirmations, chat_reads, chat_messages, chat_members, playbook_scripts, meetings, leads, pipeline_stages, "user" restart identity cascade`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close, active) values
      ('u-ana', 'Ana', 'ana@npac.test', 'HEAD', true, false, true),
      ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true, false, true),
      ('u-murilo', 'Murilo', 'murilo@npac.test', 'SDR', true, false, true),
      ('u-sonia', 'Sonia', 'sonia@npac.test', 'CLOSER', false, true, true)`;
  const [stage] = await owner<{ id: string }[]>`
    insert into pipeline_stages (key, label, position) values ('SONDAGEM', 'Sondagem', 1) returning id`;
  const [l] = await owner<{ id: string }[]>`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram)
    values ('Lead do Ale', 'R8_15K', 'INSTAGRAM', 'P1', ${stage!.id}, 'u-ale', 'u-ale', 'lead_ale') returning id`;
  lead = l!.id;
  const [m] = await owner<{ id: string }[]>`
    insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
    values (${lead}, 'u-sonia', ${at}, 'DIRETO', 'u-ale') returning id`;
  meeting = m!.id;
});

afterAll(closeTestConnections);

describe('despertador de lembretes', () => {
  it('próximo lembrete é 1 h antes; depois 15 min; depois 1 min', async () => {
    expect(await next(min(120))).toEqual(min(60));
    expect(await claim(min(61))).toEqual([]);
    const h1 = await claim(min(60));
    expect(h1).toMatchObject([{ meeting_id: meeting, step: 'H1', sdr_id: 'u-ale' }]);
    expect(h1[0]!.lead_name).toBe('Lead do Ale');
    expect(await next(min(60))).toEqual(min(15));
    expect(await claim(min(15))).toMatchObject([{ step: 'M15' }]);
    expect(await claim(min(1))).toMatchObject([{ step: 'M1' }]);
    expect(await next(min(1))).toBeNull();
  });

  it('cada etapa sai uma vez só', async () => {
    expect(await claim(min(60))).toHaveLength(1);
    expect(await claim(min(60))).toHaveLength(0);
  });

  it('parado: envia só a etapa mais recente e marca as anteriores', async () => {
    expect(await claim(min(10))).toMatchObject([{ step: 'M15' }]);
    expect(await next(min(10))).toEqual(min(1));
  });

  it('reunião já começada, cancelada ou com resultado não gera lembrete', async () => {
    expect(await claim(new Date(at.getTime() + 1000))).toEqual([]);
    await owner`update meetings set canceled_at = now() where id = ${meeting}`;
    expect(await next(min(120))).toBeNull();
    await owner`update meetings set canceled_at = null, outcome = 'DONE' where id = ${meeting}`;
    expect(await next(min(120))).toBeNull();
  });

  it('remarcar recomeça as etapas para o novo horário', async () => {
    await claim(min(60));
    const later = new Date(at.getTime() + 3 * 3600_000);
    await owner`update meetings set scheduled_at = ${later} where id = ${meeting}`;
    expect(await next(min(60))).toEqual(new Date(later.getTime() - 3600_000));
  });

  it('segue o dono atual do lead', async () => {
    await owner`update leads set sdr_id = 'u-murilo' where id = ${lead}`;
    expect(await claim(min(60))).toMatchObject([{ sdr_id: 'u-murilo' }]);
  });

  it('npac_app não lê nem grava meeting_reminders_sent direto', async () => {
    expect(await pgError(db.execute(sql`select * from meeting_reminders_sent`))).toMatch(
      /permission denied/,
    );
  });
});

describe('confirmações', () => {
  const confirm = (u: string, step = 'H1', when = at) =>
    as(
      u,
      sql`insert into meeting_confirmations (meeting_id, step, scheduled_at, user_id)
        values (${meeting}, ${step}, ${when.toISOString()}::timestamptz, ${u})`,
    );

  it('só o dono do lead confirma, e para o horário atual', async () => {
    await confirm('u-ale');
    expect(await pgError(confirm('u-murilo'))).toMatch(/row-level security/);
    expect(await pgError(confirm('u-ana', 'M15'))).toMatch(/row-level security/);
    expect(await pgError(confirm('u-ale', 'M15', min(5)))).toMatch(/row-level security/);
  });

  it('liderança e closer veem; outro SDR não', async () => {
    await confirm('u-ale');
    for (const u of ['u-ale', 'u-ana', 'u-sonia'])
      expect(await as(u, sql`select step from meeting_confirmations`)).toHaveLength(1);
    expect(await as('u-murilo', sql`select step from meeting_confirmations`)).toHaveLength(0);
  });
});

describe('inscrições de push', () => {
  const subscribe = (u: string, endpoint: string) =>
    as(u, sql`select push_subscribe(${endpoint}, '\\x01'::bytea, '\\x02'::bytea, 'Chrome')`);

  it('cada um vê e apaga só as suas; o aparelho passa para quem logou por último', async () => {
    await subscribe('u-ale', 'https://push.test/a');
    await subscribe('u-murilo', 'https://push.test/m');
    expect(await as('u-ale', sql`select endpoint from push_subscriptions`)).toEqual([
      { endpoint: 'https://push.test/a' },
    ]);
    await as('u-ale', sql`delete from push_subscriptions`);
    const [row] = await owner<{ n: number }[]>`select count(*)::int as n from push_subscriptions`;
    expect(row!.n).toBe(1);
    await subscribe('u-ale', 'https://push.test/m');
    expect(await as('u-murilo', sql`select endpoint from push_subscriptions`)).toEqual([]);
  });

  it('só a liderança apaga as inscrições de outra pessoa', async () => {
    await subscribe('u-ale', 'https://push.test/a');
    expect(await pgError(as('u-murilo', sql`select push_purge_user('u-ale')`))).toMatch(
      /sem permissão/,
    );
    await as('u-ana', sql`select push_purge_user('u-ale')`);
    expect(await as('u-ale', sql`select endpoint from push_subscriptions`)).toEqual([]);
  });
});
