// Contador global do canal ao vivo (plano docs/plans/desempenho.md, Fase 3, T3.1): toda transação
// que escreve nas tabelas do resumo antigo soma 1 a `app_revision.n`, no commit, uma vez só.
import type { Sql, TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appSql, closeTestConnections, ownerSql } from '../src/testing.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const app = appSql(DB);
const U = 'rev-sdr';
let stage = '';

const n = async () => Number((await app<{ n: string }[]>`select n from app_revision`)[0]!.n);
const novoLead = (s: Sql | TransactionSql, nome: string) =>
  s`insert into leads (name, income_band, source, stage_id, sdr_id, created_by)
    values (${nome}, 'R8_15K', 'INDICACAO', ${stage}, ${U}, ${U}) returning id`;

beforeAll(async () => {
  await owner`truncate leads, pipeline_stages restart identity cascade`;
  await owner`delete from "user" where id = ${U}`;
  await owner`insert into "user" (id, name, email, role, can_prospect, can_close)
    values (${U}, 'Rev', 'rev@p.test', 'SDR', true, false)`;
  const [s] = await owner<{ id: string }[]>`
    insert into pipeline_stages (key, label, position) values ('SONDAGEM', 'Sondagem', 1) returning id`;
  stage = s!.id;
});
afterAll(async () => {
  await owner`truncate leads restart identity cascade`;
  await owner`delete from "user" where id = ${U}`;
  await closeTestConnections();
});

describe('app_revision', () => {
  it('tem uma linha só, que npac_app lê e não altera', async () => {
    expect(await owner`select * from app_revision`).toHaveLength(1);
    await expect(owner`insert into app_revision (id, n) values (false, 0)`).rejects.toThrow();
    await expect(app`update app_revision set n = n + 1`).rejects.toThrow(/permission denied/);
    await expect(app`insert into app_revision (id, n) values (true, 0)`).rejects.toThrow();
    expect(await n()).toBeGreaterThanOrEqual(0);
  });

  it('uma transação grande soma 1, no commit; rollback não soma', async () => {
    const antes = await n();
    await owner.begin(async (s) => {
      for (let i = 0; i < 5; i++) await novoLead(s, `Rev ${i}`);
      await s`update leads set name = name || '!'`;
      // Antes do commit, quem lê de fora ainda vê o valor antigo (o aviso não sai antes do dado).
      expect(await n()).toBe(antes);
    });
    expect(await n()).toBe(antes + 1);
    await owner
      .begin(async (s) => {
        await novoLead(s, 'Desfeito');
        throw new Error('desfaz');
      })
      .catch(() => {});
    expect(await n()).toBe(antes + 1);
    await owner`select 1`;
    expect(await n()).toBe(antes + 1);
  });

  it('cada tabela do resumo antigo soma; uma tabela fora dele não', async () => {
    const [lead] = await novoLead(owner, 'Rev tabelas');
    const [solto] = await novoLead(owner, 'Rev sem filhos');
    let timeline = '';
    const passos: [string, () => Promise<unknown>][] = [
      ['leads', () => owner`update leads set name = 'Rev 2' where id = ${lead!.id}`],
      [
        'lead_tasks',
        () => owner`insert into lead_tasks (lead_id, title, assignee_id, created_by, due_at)
          values (${lead!.id}, 'Ligar', ${U}, ${U}, now())`,
      ],
      [
        'lead_timeline',
        async () => {
          const [t] = await owner<
            { id: string }[]
          >`insert into lead_timeline (lead_id, actor_id, kind)
            values (${lead!.id}, ${U}, 'lead.updated') returning id`;
          timeline = t!.id;
        },
      ],
      [
        'notifications',
        () => owner`insert into notifications (user_id, timeline_id) values (${U}, ${timeline})`,
      ],
      [
        'notifications (lida)',
        () => owner`update notifications set read_at = now() where user_id = ${U}`,
      ],
      ['leads (delete)', () => owner`delete from leads where id = ${solto!.id}`],
    ];
    for (const [nome, passo] of passos) {
      const antes = await n();
      await passo();
      expect(await n(), nome).toBe(antes + 1);
    }
    const antes = await n();
    await owner`update "user" set name = 'Rev' where id = ${U}`;
    expect(await n()).toBe(antes);
  });

  it('UPDATE que não muda nada não soma (o Chat regrava "lido até" a cada recarga)', async () => {
    const [lead] = await novoLead(owner, 'Rev igual');
    const antes = await n();
    await owner`update leads set name = name where id = ${lead!.id}`;
    expect(await n()).toBe(antes);
    // Na mesma transação, uma mudança real depois de um UPDATE igual ainda soma.
    await owner.begin(async (s) => {
      await s`update leads set name = name where id = ${lead!.id}`;
      await s`update leads set name = 'Rev mudou' where id = ${lead!.id}`;
    });
    expect(await n()).toBe(antes + 1);
  });

  it('o gatilho fica nas sete tabelas, adiado para o commit', async () => {
    const rows = await owner<{ tabela: string }[]>`
      select tgrelid::regclass::text as tabela from pg_trigger
      where tgfoid = 'app_revision_bump'::regproc and tgdeferrable and tginitdeferred
      order by 1`;
    expect(rows.map((r) => r.tabela)).toEqual([
      'chat_channels',
      'chat_messages',
      'chat_reads',
      'lead_tasks',
      'lead_timeline',
      'leads',
      'notifications',
    ]);
  });
});
