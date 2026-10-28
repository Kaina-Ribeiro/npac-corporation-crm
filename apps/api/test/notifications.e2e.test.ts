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
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
  // O Head cadastra para o Ale: o Ale é avisado de que recebeu um lead.
  const res = await h.post(
    '/api/leads',
    {
      name: 'Lead avisado',
      instagram: '@lead.avisado',
      incomeBand: 'R5_8K',
      tier: 'P1',
      sdrId: ids.ale,
    },
    head,
  );
  expect(res.status).toBe(201);
  leadId = res.body.id;
});

it('avisa o SDR e o closer do lead, nunca quem fez nem quem está fora', async () => {
  const mine = await h.get('/api/notifications', ale);
  expect(mine.status).toBe(200);
  expect(mine.body.unread).toBe(1);
  expect(mine.body.items[0]).toMatchObject({
    kind: 'lead.created',
    actorName: expect.any(String),
    leadId,
    leadName: 'Lead avisado',
    read: false,
  });
  expect((await h.get('/api/notifications', head)).body.unread).toBe(0);

  // Ale agenda com a Sônia: a Sônia é avisada, o Ale (autor) não ganha aviso novo.
  const m = await h.post(
    '/api/meetings',
    {
      leadId,
      closerId: ids.sonia,
      scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      origin: 'DIRETO',
    },
    ale,
  );
  expect(m.status).toBe(201);
  const s = await h.get('/api/notifications', sonia);
  expect(s.body.items.map((i: { kind: string }) => i.kind)).toEqual(['meeting.scheduled']);
  // A reunião em menos de 2h aparece em "Agora" para a closer.
  expect(s.body.soon).toHaveLength(1);
  expect(s.body.soon[0]).toMatchObject({ leadId, leadName: 'Lead avisado' });
  expect((await h.get('/api/notifications', ale)).body.unread).toBe(1);
  expect((await h.get('/api/notifications', murilo)).body).toMatchObject({ unread: 0, items: [] });
});

it('marcar como lido vale só para quem lê', async () => {
  expect((await h.post('/api/notifications/read', {}, ale)).status).toBe(200);
  const mine = await h.get('/api/notifications', ale);
  expect(mine.body.unread).toBe(0);
  expect(mine.body.items[0].read).toBe(true);
  // Ninguém consegue ler ou marcar aviso de outra pessoa (RLS).
  const [n] = await owner<{ read_at: Date | null }[]>`select read_at from notifications`;
  expect(n!.read_at).not.toBeNull();
  await owner`update notifications set read_at = null`;
  await h.post('/api/notifications/read', {}, murilo);
  expect((await h.get('/api/notifications', ale)).body.unread).toBe(1);
});

it('conta follow-ups atrasados do próprio SDR', async () => {
  await owner`update leads set next_contact_at = now() - interval '3 days' where id = ${leadId}`;
  expect((await h.get('/api/notifications', ale)).body.overdue).toBe(1);
  expect((await h.get('/api/notifications', murilo)).body.overdue).toBe(0);
});
