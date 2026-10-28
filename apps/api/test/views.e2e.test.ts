import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication, h: ReturnType<typeof api>, ale: string, murilo: string;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate saved_views`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
});

it('salva, lista e apaga filtros da própria pessoa', async () => {
  const created = await h.post(
    '/api/views',
    { name: 'Meus P0 atrasados', filters: { tier: 'P0', period: 'OVERDUE' } },
    ale,
  );
  expect(created.status).toBe(201);
  const list = await h.get('/api/views', ale);
  expect(list.body).toEqual([
    { id: created.body.id, name: 'Meus P0 atrasados', filters: { tier: 'P0', period: 'OVERDUE' } },
  ]);
  // Outra pessoa não vê nem apaga (RLS).
  expect((await h.get('/api/views', murilo)).body).toEqual([]);
  expect((await h.del(`/api/views/${created.body.id}`, {}, murilo)).status).toBe(404);
  expect((await h.del(`/api/views/${created.body.id}`, {}, ale)).status).toBe(200);
  expect((await h.get('/api/views', ale)).body).toEqual([]);
});

it('recusa termo de busca e critérios desconhecidos', async () => {
  for (const filters of [{ search: 'Maria' }, { phone: '11999' }, { tier: 'P9' }]) {
    expect((await h.post('/api/views', { name: 'x', filters }, ale)).status).toBe(400);
  }
  expect((await h.post('/api/views', { name: '', filters: { tier: 'P0' } }, ale)).status).toBe(400);
});
