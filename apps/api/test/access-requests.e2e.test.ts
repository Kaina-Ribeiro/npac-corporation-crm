import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;

const REQUEST = '/api/auth/request-access';
const nova = {
  name: 'Nova Pessoa',
  username: 'nova.pessoa',
  email: 'nova@novo.test',
  password: '123',
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await owner`truncate access_requests`;
  await owner`delete from account where user_id in (select id from "user" where email like '%@novo.test')`;
  await owner`delete from session where user_id in (select id from "user" where email like '%@novo.test')`;
  await owner`delete from "user" where email like '%@novo.test'`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate access_requests`;
});

describe('pedido de acesso', () => {
  it('cria pedido pendente que não consegue logar', async () => {
    const res = await h.post(REQUEST, nova);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const rows = await owner<{ password_hash: string }[]>`
      select password_hash from access_requests where username = 'nova.pessoa'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.password_hash).not.toBe('123');
    expect((await h.signInRaw('nova.pessoa@x', '123')).status).toBe(401);
  });

  it('usuário existente responde igual e não grava', async () => {
    const res = await h.post(REQUEST, { ...nova, username: 'ale' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await owner`select id from access_requests`).toHaveLength(0);
  });

  it('pedido repetido mantém o primeiro', async () => {
    expect((await h.post(REQUEST, nova)).status).toBe(200);
    expect((await h.post(REQUEST, { ...nova, name: 'Outra Pessoa' })).status).toBe(200);
    const rows = await owner<{ name: string }[]>`select name from access_requests`;
    expect(rows.map((r) => r.name)).toEqual(['Nova Pessoa']);
  });

  it('valida campos', async () => {
    expect((await h.post(REQUEST, { ...nova, username: 'Com Espaço' })).status).toBe(400);
    expect((await h.post(REQUEST, { ...nova, role: 'HEAD' })).status).toBe(400);
  });

  it('limita a 3 por hora por IP', async () => {
    for (const u of ['um.pedido', 'dois.pedido', 'tres.pedido'])
      expect((await h.post(REQUEST, { ...nova, username: u })).status).toBe(200);
    expect((await h.post(REQUEST, { ...nova, username: 'quatro.pedido' })).status).toBe(429);
  });

  it('audita sem dados pessoais', async () => {
    await h.post(REQUEST, nova);
    const logs = await owner<{ action: string; entity_type: string; data: unknown }[]>`
      select action, entity_type, data from audit_log where action like 'access_request.%'`;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'access_request.create',
      entity_type: 'access_request',
    });
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain('nova@novo.test');
    expect(dump).not.toContain('Nova Pessoa');
  });
});
