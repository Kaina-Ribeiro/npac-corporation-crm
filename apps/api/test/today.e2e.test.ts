import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { spDayRange } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ale: string, murilo: string;
let a: string, m: string;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, lead_timeline, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  a = (
    await h.post(
      '/api/leads',
      { name: 'Hoje Ale', instagram: '@hoje.ale', incomeBand: 'R5_10K', tier: 'P1' },
      ale,
    )
  ).body.id;
  m = (
    await h.post(
      '/api/leads',
      { name: 'Hoje Murilo', instagram: '@hoje.murilo', incomeBand: 'R5_10K', tier: 'P1' },
      murilo,
    )
  ).body.id;
});
it('Hoje usa o dia BRT e só retorna dados do escopo', async () => {
  const { start, end } = spDayRange(new Date());
  await owner`update leads set next_contact_at = ${new Date(start.getTime() - 1000)} where id = ${a}`;
  await owner`update leads set next_contact_at = ${new Date(end.getTime() - 1000)} where id = ${m}`;
  let res = await h.post('/api/today/search', {}, ale);
  expect(res.status).toBe(200);
  expect(res.body.overdue.map((l: { id: string }) => l.id)).toEqual([a]);
  expect(JSON.stringify(res.body)).not.toContain('Hoje Murilo');
  res = await h.post('/api/today/search', {}, murilo);
  expect(res.body.contacts.map((l: { id: string }) => l.id)).toEqual([m]);
  await owner`update leads set next_contact_at = ${end} where id = ${m}`;
  expect((await h.post('/api/today/search', {}, murilo)).body.contacts).toEqual([]);
  expect((await h.post('/api/today/search', { sdrId: 'alguem' }, ale)).status).toBe(403);
});
it('tarefas concluídas saem da aba Hoje', async () => {
  const task = await h.post(
    `/api/leads/${a}/tasks`,
    { title: 'Retorno hoje', dueAt: new Date().toISOString() },
    ale,
  );
  expect((await h.post('/api/today/search', {}, ale)).body.tasks).toHaveLength(1);
  await h.patch(`/api/leads/${a}/tasks/${task.body.id}`, { version: 1, completed: true }, ale);
  expect((await h.post('/api/today/search', {}, ale)).body.tasks).toHaveLength(0);
});

it('tarefas avulsas são pessoais e podem ser concluídas sem lead', async () => {
  const res = await h.post('/api/tasks', { title: 'Preparar roteiro' }, ale);
  expect(res.status).toBe(201);
  const mine = await h.post('/api/today/search', {}, ale);
  expect(mine.body.tasks).toHaveLength(1);
  expect(mine.body.tasks[0].leadId).toBeNull();
  expect((await h.post('/api/today/search', {}, murilo)).body.tasks).toHaveLength(0);
  expect(
    (await h.patch(`/api/tasks/${res.body.id}`, { version: 1, completed: true }, murilo)).status,
  ).toBe(404);
  expect(
    (await h.patch(`/api/tasks/${res.body.id}`, { version: 1, completed: true }, ale)).status,
  ).toBe(200);
  expect((await h.post('/api/today/search', {}, ale)).body.tasks).toHaveLength(0);
});
