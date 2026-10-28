import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

let general: string;
let leadOfAle: string;

/** Executa SQL como npac_app com o usuário dado; devolve as linhas. */
function as<T extends Record<string, unknown>>(userId: string, q: ReturnType<typeof sql>) {
  return withUser(db, userId, (tx) => tx.execute<T>(q)).then((r) => [...r]);
}

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
  await owner`truncate chat_reads, chat_messages, chat_members, playbook_scripts, meetings, leads, pipeline_stages, "user" restart identity cascade`;
  await owner`delete from chat_channels where kind = 'DM'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close, active) values
      ('u-ana', 'Ana', 'ana@npac.test', 'HEAD', true, false, true),
      ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true, false, true),
      ('u-murilo', 'Murilo', 'murilo@npac.test', 'SDR', true, false, true),
      ('u-old', 'Antigo', 'old@npac.test', 'SDR', true, false, false)`;
  const [stage] = await owner<{ id: string }[]>`
    insert into pipeline_stages (key, label, position) values ('SONDAGEM', 'Sondagem', 1) returning id`;
  const [lead] = await owner<{ id: string }[]>`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram)
    values ('Lead do Ale', 'R10_20K', 'INSTAGRAM', 'P1', ${stage!.id}, 'u-ale', 'u-ale', 'lead_ale') returning id`;
  leadOfAle = lead!.id;
  const [g] = await owner<{ id: string }[]>`select id from chat_channels where kind = 'GENERAL'`;
  general = g!.id;
});

afterAll(closeTestConnections);

describe('chat', () => {
  it('canal Geral existe e é visível a todo usuário ativo', async () => {
    for (const u of ['u-ana', 'u-ale', 'u-murilo']) {
      const rows = await as<{ id: string }>(u, sql`select id from chat_channels`);
      expect(rows.map((r) => r.id)).toContain(general);
    }
    expect(await as(`u-old`, sql`select id from chat_channels`)).toHaveLength(0);
  });

  it('DM é privada: nem HEAD lê DM alheia', async () => {
    const [{ id: dm }] = (await as<{ id: string }>(
      'u-ale',
      sql`select chat_open_dm('u-murilo') as id`,
    )) as [{ id: string }];
    await as(
      'u-ale',
      sql`insert into chat_messages (channel_id, author_id, body) values (${dm}, 'u-ale', 'oi')`,
    );
    expect(
      await as('u-murilo', sql`select body from chat_messages where channel_id = ${dm}`),
    ).toHaveLength(1);
    expect(
      await as('u-ana', sql`select body from chat_messages where channel_id = ${dm}`),
    ).toHaveLength(0);
    expect(await as('u-ana', sql`select id from chat_channels where id = ${dm}`)).toHaveLength(0);
    expect(
      await pgError(
        as(
          'u-ana',
          sql`insert into chat_messages (channel_id, author_id, body) values (${dm}, 'u-ana', 'x')`,
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it('abrir DM é idempotente e recusa a si mesmo ou inativo', async () => {
    const a = await as<{ id: string }>('u-ale', sql`select chat_open_dm('u-murilo') as id`);
    const b = await as<{ id: string }>('u-murilo', sql`select chat_open_dm('u-ale') as id`);
    expect(a[0]!.id).toBe(b[0]!.id);
    expect(await pgError(as('u-ale', sql`select chat_open_dm('u-ale')`))).toMatch(/destinatário/);
    expect(await pgError(as('u-ale', sql`select chat_open_dm('u-old')`))).toMatch(/destinatário/);
  });

  it('não envia em nome de outro nem menciona lead invisível', async () => {
    expect(
      await pgError(
        as(
          'u-ale',
          sql`insert into chat_messages (channel_id, author_id, body) values (${general}, 'u-murilo', 'x')`,
        ),
      ),
    ).toMatch(/row-level security/);
    expect(
      await pgError(
        as(
          'u-murilo',
          sql`insert into chat_messages (channel_id, author_id, body, lead_id) values (${general}, 'u-murilo', 'x', ${leadOfAle})`,
        ),
      ),
    ).toMatch(/row-level security/);
    await as(
      'u-ale',
      sql`insert into chat_messages (channel_id, author_id, body, lead_id) values (${general}, 'u-ale', 'veja', ${leadOfAle})`,
    );
  });

  it('mensagens são append-only e leituras são pessoais', async () => {
    await as(
      'u-ale',
      sql`insert into chat_messages (channel_id, author_id, body) values (${general}, 'u-ale', 'oi')`,
    );
    expect(await pgError(as('u-ale', sql`update chat_messages set body = 'editado'`))).toMatch(
      /permission denied/,
    );
    expect(await pgError(as('u-ale', sql`delete from chat_messages`))).toMatch(/permission denied/);
    await as(
      'u-ale',
      sql`insert into chat_reads (channel_id, user_id, last_read_id) values (${general}, 'u-ale', 1)`,
    );
    expect(await as('u-murilo', sql`select * from chat_reads`)).toHaveLength(0);
    expect(
      await pgError(
        as(
          'u-ale',
          sql`insert into chat_reads (channel_id, user_id, last_read_id) values (${general}, 'u-murilo', 1)`,
        ),
      ),
    ).toMatch(/row-level security/);
  });
});

describe('playbook', () => {
  it('todos leem; só HEAD escreve', async () => {
    await as(
      'u-ana',
      sql`insert into playbook_scripts (topic, title, body, updated_by) values ('Preço', 'Está caro', 'Resposta', 'u-ana')`,
    );
    expect(await as('u-ale', sql`select id from playbook_scripts`)).toHaveLength(1);
    expect(
      await pgError(
        as(
          'u-ale',
          sql`insert into playbook_scripts (topic, title, body, updated_by) values ('a', 'b', 'c', 'u-ale')`,
        ),
      ),
    ).toMatch(/row-level security/);
    const upd = await as(
      'u-ale',
      sql`update playbook_scripts set body = 'x', updated_by = 'u-ale' returning id`,
    );
    expect(upd).toHaveLength(0);
  });
});
