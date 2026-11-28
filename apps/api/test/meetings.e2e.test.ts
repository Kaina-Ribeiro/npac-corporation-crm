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
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, sdr_sale_marks, leads`;
  ale = await h.signIn('ale@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
  const res = await h.post(
    '/api/leads',
    {
      name: 'Lead reunião',
      instagram: '@teste.meeting',
      incomeBand: 'R5_8K',
      source: 'BIO',
      tier: 'P1',
    },
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
  // Resultado só depois do horário marcado.
  const early = await h.post(`/api/meetings/${id}/outcome`, { version: 2, outcome: 'DONE' }, sonia);
  expect(early.status).toBe(400);
  expect(early.body.message).toBe('A reunião ainda não aconteceu');
  await owner`update meetings set scheduled_at = now() - interval '1 hour' where id = ${id}`;
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
it('resultado remarcado é aceito depois do horário', async () => {
  const id = await schedule();
  await owner`update meetings set scheduled_at = now() - interval '1 hour' where id = ${id}`;
  const res = await h.post(
    `/api/meetings/${id}/outcome`,
    { version: 1, outcome: 'RESCHEDULED' },
    sonia,
  );
  expect(res.status).toBe(200);
  const [m] = await owner<{ outcome: string }[]>`select outcome from meetings where id = ${id}`;
  expect(m!.outcome).toBe('RESCHEDULED');
});
// NPAC-82 (Igor, 27/11/2026): duas reuniões do mesmo lead no mesmo horário, marcadas realizadas,
// somavam o valor duas vezes.
it('não aceita duas reuniões do mesmo lead no mesmo minuto (NPAC-82)', async () => {
  const id = await schedule();
  const dup = await h.post(
    '/api/meetings',
    { ...body(), scheduledAt: '2030-01-10T23:30:40-03:00' },
    ale,
  );
  expect(dup.status).toBe(409);
  expect(dup.body).toMatchObject({
    code: 'MEETING_EXISTS',
    message: 'O lead já tem reunião nesse horário.',
  });
  // Outro minuto pode; remarcar para o minuto da outra, não.
  const other = await h.post(
    '/api/meetings',
    { ...body(), scheduledAt: '2030-01-10T23:31:00-03:00' },
    ale,
  );
  expect(other.status).toBe(201);
  const moved = await h.patch(
    `/api/meetings/${other.body.id}`,
    { version: 1, scheduledAt: '2030-01-10T23:30:00-03:00' },
    ale,
  );
  expect(moved.status).toBe(409);
  expect(moved.body.code).toBe('MEETING_EXISTS');
  // Cancelada não conta.
  expect((await h.post(`/api/meetings/${id}/cancel`, { version: 1 }, ale)).status).toBe(200);
  expect(
    (
      await h.patch(
        `/api/meetings/${other.body.id}`,
        { version: 1, scheduledAt: '2030-01-10T23:30:00-03:00' },
        ale,
      )
    ).status,
  ).toBe(200);
  // O banco também recusa.
  await expect(
    owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${leadId}, ${ids.sonia!}, '2030-01-11T02:30:20Z', 'DIRETO', ${ids.ale!})`,
  ).rejects.toThrow(/meetings_lead_minuto/);
});
it('"a reunião já aconteceu" no minuto de outra reunião do lead é recusada (NPAC-82)', async () => {
  const id = await schedule();
  const [m] = await owner<{ at: Date }[]>`
    update meetings set scheduled_at = date_trunc('minute', now()) - interval '2 hours'
    where id = ${id} returning scheduled_at as at`;
  const res = await h.post(
    '/api/meetings/done',
    { ...body(), scheduledAt: m!.at.toISOString() },
    ale,
  );
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('MEETING_EXISTS');
  const [n] = await owner<{ n: number }[]>`select count(*)::int as n from meetings`;
  expect(n!.n).toBe(1);
});
it('a liderança corrige o resultado sem mudar o dia do ganho; o mesmo resultado de novo é recusado (NPAC-82)', async () => {
  const id = await schedule();
  await owner`update meetings set scheduled_at = now() - interval '1 hour' where id = ${id}`;
  expect(
    (await h.post(`/api/meetings/${id}/outcome`, { version: 1, outcome: 'DONE' }, sonia)).status,
  ).toBe(200);
  await owner`update meetings set outcome_at = '2026-11-07T17:00:00Z' where id = ${id}`;
  const same = await h.post(`/api/meetings/${id}/outcome`, { version: 2, outcome: 'DONE' }, head);
  expect(same.status).toBe(409);
  expect(same.body.message).toBe('A reunião já está com esse resultado');
  expect(
    (await h.post(`/api/meetings/${id}/outcome`, { version: 2, outcome: 'NO_SHOW' }, head)).status,
  ).toBe(200);
  const [m] = await owner<
    { outcome: string; at: Date }[]
  >`select outcome, outcome_at as at from meetings where id = ${id}`;
  expect(m).toMatchObject({ outcome: 'NO_SHOW' });
  expect(m!.at.toISOString()).toBe('2026-11-07T17:00:00.000Z');
});
it('reunião com resultado não remarca, não cancela e só a liderança corrige o resultado', async () => {
  const id = await schedule();
  await owner`update meetings set scheduled_at = now() - interval '1 hour' where id = ${id}`;
  expect(
    (await h.post(`/api/meetings/${id}/outcome`, { version: 1, outcome: 'NO_SHOW' }, sonia)).status,
  ).toBe(200);
  const again = await h.post(`/api/meetings/${id}/outcome`, { version: 2, outcome: 'DONE' }, sonia);
  expect(again.status).toBe(409);
  expect(again.body.message).toBe('A reunião já tem resultado');
  expect(
    (
      await h.patch(
        `/api/meetings/${id}`,
        { version: 2, scheduledAt: '2030-01-13T10:00:00-03:00' },
        ale,
      )
    ).status,
  ).toBe(409);
  expect(
    (await h.patch(`/api/meetings/${id}`, { version: 2, closerId: ids.ronaldo }, head)).status,
  ).toBe(409);
  expect((await h.post(`/api/meetings/${id}/cancel`, { version: 2 }, sonia)).status).toBe(409);
  // A liderança corrige um resultado errado; a versão avança e a timeline registra.
  expect(
    (await h.post(`/api/meetings/${id}/outcome`, { version: 2, outcome: 'DONE' }, head)).status,
  ).toBe(200);
  const [m] = await h.get(`/api/meetings?leadId=${leadId}`, ale).then((r) => r.body);
  expect(m).toMatchObject({ outcome: 'DONE', version: 3, canceledAt: null });
});
