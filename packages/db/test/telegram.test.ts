import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

/**
 * Avisos pelo Telegram (NPAC-74): código de uso único e vínculo pessoa ↔ chat. Quem grava o vínculo é o
 * webhook (sem sessão); a pessoa só pede o código, vê e apaga o próprio vínculo.
 */
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const hash = (code: string) => createHash('sha256').update(code).digest();
const chat = (n: string) => Buffer.from(`cifrado-${n}`);

async function pgError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = (e instanceof Error && e.cause instanceof Error ? e.cause : e) as {
      code?: string;
      message: string;
    };
    return err;
  }
  throw new Error('esperava erro');
}

const pedirCodigo = (uid: string, code: string) =>
  withUser(db, uid, (tx) => tx.execute(sql`select telegram_codigo(${hash(code)})`));
const conectar = (code: string, bidx: string, chatN = bidx) =>
  db
    .execute<{ uid: string | null }>(
      sql`select telegram_conectar(${hash(code)}, ${chat(chatN)}, ${bidx}) as uid`,
    )
    .then((r) => r[0]!.uid);
const vinculos = () =>
  owner<{ user_id: string; chat_bidx: string }[]>`
    select user_id, chat_bidx from telegram_vinculos order by user_id`;

beforeEach(async () => {
  await owner`truncate telegram_vinculos, telegram_codigos, push_subscriptions, "user" restart identity cascade`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close, active) values
      ('u-dir', 'Diretor', 'dir@npac.test', 'DIRETOR', true, true, true),
      ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true, false, true),
      ('u-murilo', 'Murilo', 'murilo@npac.test', 'SDR', true, false, true)`;
});
afterAll(async () => closeTestConnections());

describe('código do "Conectar Telegram"', () => {
  it('só com sessão; pedir de novo troca o anterior; vale 10 minutos', async () => {
    expect((await pgError(db.execute(sql`select telegram_codigo(${hash('x')})`))).code).toBe(
      '42501',
    );
    await pedirCodigo('u-ale', 'primeiro');
    await pedirCodigo('u-ale', 'segundo');
    const rows = await owner<{ user_id: string; min: number }[]>`
      select user_id, round(extract(epoch from vence_em - now()) / 60)::int as min from telegram_codigos`;
    expect(rows).toEqual([{ user_id: 'u-ale', min: 10 }]);
    expect(await conectar('primeiro', 'b1')).toBeNull();
    expect(await conectar('segundo', 'b1')).toBe('u-ale');
  });

  it('a pessoa não lê nem grava códigos direto', async () => {
    await pedirCodigo('u-ale', 'c');
    const ler = await pgError(
      withUser(db, 'u-ale', (tx) => tx.execute(sql`select 1 from telegram_codigos`)),
    );
    expect(ler.code).toBe('42501');
    expect(
      (
        await pgError(
          withUser(db, 'u-ale', (tx) =>
            tx.execute(
              sql`insert into telegram_codigos (user_id, hash, vence_em) values ('u-ale', ${hash('z')}, now() + interval '1 day')`,
            ),
          ),
        )
      ).code,
    ).toBe('42501');
  });
});

describe('telegram_conectar (o webhook)', () => {
  it('troca o código pelo vínculo, uma vez só', async () => {
    await pedirCodigo('u-ale', 'c');
    expect(await conectar('c', 'b1')).toBe('u-ale');
    expect(await vinculos()).toEqual([{ user_id: 'u-ale', chat_bidx: 'b1' }]);
    expect(await conectar('c', 'b2')).toBeNull();
    expect(await vinculos()).toEqual([{ user_id: 'u-ale', chat_bidx: 'b1' }]);
  });

  it('pedido logado não conecta', async () => {
    await pedirCodigo('u-ale', 'c');
    const e = await pgError(
      withUser(db, 'u-ale', (tx) =>
        tx.execute(sql`select telegram_conectar(${hash('c')}, ${chat('x')}, 'b1')`),
      ),
    );
    expect(e.code).toBe('42501');
  });

  it('código vencido não conecta e sai do banco', async () => {
    await pedirCodigo('u-ale', 'c');
    await owner`update telegram_codigos set vence_em = now() - interval '1 second'`;
    expect(await conectar('c', 'b1')).toBeNull();
    expect(await owner`select 1 from telegram_codigos`).toHaveLength(0);
    expect(await vinculos()).toEqual([]);
  });

  it('conta desativada não conecta', async () => {
    await pedirCodigo('u-ale', 'c');
    await owner`update "user" set active = false where id = 'u-ale'`;
    expect(await conectar('c', 'b1')).toBeNull();
    expect(await vinculos()).toEqual([]);
  });

  it('um Telegram por pessoa: o mesmo chat em outra conta sai da primeira', async () => {
    await pedirCodigo('u-ale', 'a');
    await conectar('a', 'mesmo-chat');
    await pedirCodigo('u-murilo', 'm');
    expect(await conectar('m', 'mesmo-chat')).toBe('u-murilo');
    expect(await vinculos()).toEqual([{ user_id: 'u-murilo', chat_bidx: 'mesmo-chat' }]);
  });

  it('conectar de novo troca o chat da pessoa', async () => {
    await pedirCodigo('u-ale', 'a');
    await conectar('a', 'chat-velho');
    await pedirCodigo('u-ale', 'b');
    await conectar('b', 'chat-novo');
    expect(await vinculos()).toEqual([{ user_id: 'u-ale', chat_bidx: 'chat-novo' }]);
  });
});

describe('vínculo sob a RLS', () => {
  beforeEach(async () => {
    await pedirCodigo('u-ale', 'a');
    await conectar('a', 'b-ale');
    await pedirCodigo('u-murilo', 'm');
    await conectar('m', 'b-murilo');
  });

  it('cada um vê e apaga só o seu', async () => {
    const vistos = await withUser(db, 'u-ale', (tx) =>
      tx.execute<{ user_id: string }>(sql`select user_id from telegram_vinculos`),
    );
    expect([...vistos]).toEqual([{ user_id: 'u-ale' }]);
    await withUser(db, 'u-ale', (tx) => tx.execute(sql`delete from telegram_vinculos`));
    expect(await vinculos()).toEqual([{ user_id: 'u-murilo', chat_bidx: 'b-murilo' }]);
  });

  it('ninguém grava nem muda o vínculo direto', async () => {
    const ins = await pgError(
      withUser(db, 'u-ale', (tx) =>
        tx.execute(
          sql`insert into telegram_vinculos (user_id, chat_enc, chat_bidx) values ('u-ale', ${chat('x')}, 'x')`,
        ),
      ),
    );
    expect(ins.code).toBe('42501');
    const upd = await pgError(
      withUser(db, 'u-ale', (tx) => tx.execute(sql`update telegram_vinculos set chat_bidx = 'y'`)),
    );
    expect(upd.code).toBe('42501');
  });

  it('desativar a pessoa (push_purge_user) apaga o vínculo e o código', async () => {
    await pedirCodigo('u-ale', 'pendente');
    await withUser(db, 'u-dir', (tx) => tx.execute(sql`select push_purge_user('u-ale')`));
    expect(await vinculos()).toEqual([{ user_id: 'u-murilo', chat_bidx: 'b-murilo' }]);
    expect(await owner`select 1 from telegram_codigos where user_id = 'u-ale'`).toHaveLength(0);
  });
});
