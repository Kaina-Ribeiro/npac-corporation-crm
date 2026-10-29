import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appSql, closeTestConnections, ownerSql } from '../src/testing.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const app = appSql(DB);

async function pgError(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { message: string; code?: string };
  }
  throw new Error('esperava erro');
}

const request = (username: string) =>
  app`insert into access_requests (name, username, email, password_hash)
      values ('Nova Pessoa', ${username}, 'nova@novo.test', 'hash') returning id`;

beforeEach(async () => {
  await owner`truncate access_requests`;
});
afterAll(async () => closeTestConnections());

describe('access_requests', () => {
  it('npac_app cria, lê e apaga pedidos', async () => {
    const [row] = await request('nova.pessoa');
    expect((await app`select username from access_requests`).map((r) => r.username)).toEqual([
      'nova.pessoa',
    ]);
    await app`delete from access_requests where id = ${row!.id}`;
    expect(await app`select id from access_requests`).toHaveLength(0);
  });

  it('npac_app não altera pedidos', async () => {
    await request('nova.pessoa');
    const err = await pgError(app`update access_requests set name = 'Outra'`);
    expect(err.message).toMatch(/permission denied/);
  });

  it('usuário é único entre pedidos', async () => {
    await request('nova.pessoa');
    expect((await pgError(request('nova.pessoa'))).code).toBe('23505');
  });
});
