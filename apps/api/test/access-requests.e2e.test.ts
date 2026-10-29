import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, cookiesOf, createTestApp, owner, resetAuthState } from './helpers.js';

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

describe('aprovação', () => {
  const LIST = '/api/admin/access-requests';
  const SDR = { role: 'SDR', canProspect: true, canClose: false };
  let id: string;
  let head: string;

  beforeEach(async () => {
    await owner`delete from account where user_id in (select id from "user" where email like '%@novo.test')`;
    await owner`delete from "user" where email like '%@novo.test'`;
    await owner`update "user" set role = 'HEAD' where email = 'ana@npac.com.br'`;
    await h.post(REQUEST, nova);
    const [row] = await owner<{ id: string }[]>`select id from access_requests`;
    id = row!.id;
    head = await h.signIn('ronaldo@npac.com.br');
  });
  afterAll(async () => {
    await owner`update "user" set role = 'HEAD' where email = 'ana@npac.com.br'`;
  });

  const pending = async () => (await owner`select id from access_requests`).length;

  it('SDR não vê nem aprova pedidos', async () => {
    const ale = await h.signIn('ale@npac.com.br');
    expect((await h.get(LIST, ale)).status).toBe(403);
    expect((await h.post(`${LIST}/${id}/approve`, SDR, ale)).status).toBe(403);
  });

  it('liderança lista os pedidos sem a senha', async () => {
    const res = await h.get(LIST, head);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id,
        name: 'Nova Pessoa',
        username: 'nova.pessoa',
        email: 'nova@novo.test',
        createdAt: expect.any(String),
      },
    ]);
  });

  it('liderança aprova como SDR e a pessoa entra com a própria senha', async () => {
    const res = await h.post(`${LIST}/${id}/approve`, SDR, head);
    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(await pending()).toBe(0);
    const login = await h.signInRaw('nova.pessoa@x', '123');
    expect(login.status).toBe(200);
    const me = await h.get('/api/me', cookiesOf(login));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ role: 'SDR', canProspect: true, mustChangePassword: false });
  });

  it('Head não aprova cargo de liderança', async () => {
    const res = await h.post(`${LIST}/${id}/approve`, { ...SDR, role: 'HEAD' }, head);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Só a Diretoria pode dar cargo de Head ou Diretoria');
    expect(await pending()).toBe(1);
  });

  it('Diretoria aprova como Head', async () => {
    await owner`update "user" set role = 'DIRETOR' where email = 'ana@npac.com.br'`;
    const diretor = await h.signIn('ana@npac.com.br');
    const res = await h.post(
      `${LIST}/${id}/approve`,
      { role: 'HEAD', canProspect: true, canClose: true },
      diretor,
    );
    expect(res.status).toBe(201);
  });

  it('e-mail já usado não aprova e o pedido fica', async () => {
    await owner`update access_requests set email = 'ale@npac.com.br'`;
    const res = await h.post(`${LIST}/${id}/approve`, SDR, head);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('E-mail ou usuário já cadastrado');
    expect(await pending()).toBe(1);
  });

  it('recusar apaga o pedido', async () => {
    expect((await h.del(`${LIST}/${id}`, {}, head)).status).toBe(204);
    expect((await h.get(LIST, head)).body).toEqual([]);
    expect((await h.post(`${LIST}/${id}/approve`, SDR, head)).status).toBe(404);
  });

  it('pedido expirado some e não é aprovado', async () => {
    await owner`update access_requests set created_at = now() - interval '8 days'`;
    expect((await h.get(LIST, head)).body).toEqual([]);
    expect((await h.post(`${LIST}/${id}/approve`, SDR, head)).status).toBe(404);
  });

  it('audita aprovação e recusa sem dados pessoais', async () => {
    await h.post(`${LIST}/${id}/approve`, SDR, head);
    await h.post(REQUEST, { ...nova, username: 'outra.pessoa', email: 'outra@novo.test' });
    const [other] = await owner<{ id: string }[]>`select id from access_requests`;
    await h.del(`${LIST}/${other!.id}`, {}, head);
    const logs = await owner<{ action: string; data: { fields?: string[] } }[]>`
      select action, data from audit_log where action like 'admin.access_request.%' order by id`;
    expect(logs.map((l) => l.action)).toEqual([
      'admin.access_request.approve',
      'admin.access_request.reject',
    ]);
    expect(logs[0]!.data.fields).toEqual(['role', 'canProspect', 'canClose']);
    expect(JSON.stringify(logs)).not.toContain('@novo.test');
  });
});
