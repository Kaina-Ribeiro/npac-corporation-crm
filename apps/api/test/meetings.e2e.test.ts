import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ids: Record<string, string>;
let ale: string, sonia: string, murilo: string, head: string, leadId: string;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, lead_timeline, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
  const res = await h.post(
    '/api/leads',
    { name: 'Lead reunião', instagram: '@teste.meeting', incomeBand: 'R5_10K', tier: 'P1' },
    ale,
  );
  leadId = res.body.id;
});
const body = () => ({
  leadId,
  closerId: ids.sonia,
  scheduledAt: '2030-01-10T23:30:00-03:00',
  origin: 'DIRETO',
});
async function schedule() {
  const res = await h.post('/api/meetings', body(), ale);
  expect(res.status).toBe(201);
  return res.body.id as string;
}
it('SDR agenda, closer vê e BRT é armazenado como instante UTC', async () => {
  const id = await schedule();
  const res = await h.get(`/api/meetings?leadId=${leadId}`, sonia);
  expect(res.status).toBe(200);
  expect(res.body[0]).toMatchObject({ id, scheduledAt: '2030-01-11T02:30:00.000Z', version: 1 });
  expect((await h.get(`/api/meetings?leadId=${leadId}`, murilo)).status).toBe(404);
  expect((await h.post('/api/meetings', body(), sonia)).status).toBe(403);
  expect((await h.post('/api/meetings', { ...body(), closerId: ids.murilo }, ale)).status).toBe(
    400,
  );
});
it('reagendamento e resultado controlam versão', async () => {
  const id = await schedule();
  expect(
    (
      await h.patch(
        `/api/meetings/${id}`,
        { version: 1, scheduledAt: '2030-01-12T10:00:00-03:00' },
        sonia,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await h.patch(
        `/api/meetings/${id}`,
        { version: 1, scheduledAt: '2030-01-13T10:00:00-03:00' },
        ale,
      )
    ).status,
  ).toBe(409);
  expect(
    (await h.post(`/api/meetings/${id}/outcome`, { version: 2, outcome: 'NO_SHOW' }, sonia)).status,
  ).toBe(200);
  expect((await h.get(`/api/meetings?leadId=${leadId}`, ale)).body[0].outcome).toBe('NO_SHOW');
});
it('só HEAD troca closer e a troca revoga o acesso da Sônia', async () => {
  const id = await schedule();
  expect(
    (await h.patch(`/api/meetings/${id}`, { version: 1, closerId: ids.ronaldo }, ale)).status,
  ).toBe(403);
  expect(
    (await h.patch(`/api/meetings/${id}`, { version: 1, closerId: ids.ronaldo }, head)).status,
  ).toBe(200);
  expect((await h.get(`/api/leads/${leadId}`, sonia)).status).toBe(404);
});
it('cancelar revoga acesso, não pode ser desfeito por campo arbitrário', async () => {
  const id = await schedule();
  expect(
    (await h.patch(`/api/meetings/${id}`, { version: 1, canceledAt: null }, sonia)).status,
  ).toBe(400);
  expect((await h.post(`/api/meetings/${id}/cancel`, { version: 1 }, sonia)).status).toBe(200);
  expect((await h.get(`/api/leads/${leadId}`, sonia)).status).toBe(404);
  const rows =
    await owner`select kind from lead_timeline where lead_id = ${leadId} and kind = 'meeting.canceled'`;
  expect(rows).toHaveLength(1);
});
