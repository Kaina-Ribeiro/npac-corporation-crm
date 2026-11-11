import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Db } from '@npac/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB } from '../src/common/db/db.module.js';
import { PUSH_SENDER, PushService } from '../src/push/push.service.js';
import { REMINDER_CLOCK, ReminderScheduler } from '../src/push/reminders.js';
import {
  api,
  closeTestApp,
  createTestApp,
  FakeClock,
  type MemoryPushSender,
  owner,
  resetAuthState,
} from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ids: Record<string, string>;
let ale: string, sonia: string, murilo: string, head: string, leadId: string;
let push: MemoryPushSender;
let clock: FakeClock;
let scheduler: ReminderScheduler;
const MIN = 60_000;
/** Horários redondos em segundos (o banco guarda microssegundos; a API devolve ms). */
const future = (ms: number) => Math.floor((Date.now() + ms) / 1000) * 1000;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  push = app.get(PUSH_SENDER);
  clock = app.get(REMINDER_CLOCK);
  scheduler = app.get(ReminderScheduler);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate push_subscriptions, lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, leads`;
  await owner`delete from chat_channels where kind = 'DM'`;
  ale = await h.signIn('ale@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
  const res = await h.post(
    '/api/leads',
    {
      name: 'Lead lembrete',
      phone: '11987654321',
      instagram: '@lead.lembrete',
      incomeBand: 'R5_8K',
      source: 'BIO',
      tier: 'P1',
    },
    ale,
  );
  expect(res.status).toBe(201);
  leadId = res.body.id;
  await scheduler.settled();
  clock.reset();
  push.sent = [];
  push.gone.clear();
});

const device = (who: string) => `https://push.test/${who}`;
async function subscribe(cookie: string, who: string) {
  const res = await h.post(
    '/api/push/subscriptions',
    { endpoint: device(who), keys: { p256dh: `p-${who}`, auth: `a-${who}` } },
    cookie,
  );
  expect(res.status).toBe(200);
}
async function schedule(at: number) {
  const res = await h.post(
    '/api/meetings',
    { leadId, closerId: ids.sonia, scheduledAt: new Date(at).toISOString(), origin: 'DIRETO' },
    ale,
  );
  expect(res.status).toBe(201);
  await scheduler.settled();
  return res.body as { id: string; version: number };
}
async function advance(at: number) {
  clock.advanceTo(at);
  await scheduler.settled();
}

describe('push do chat', () => {
  beforeEach(async () => {
    for (const [c, who] of [
      [ale, 'ale'],
      [murilo, 'murilo'],
      [sonia, 'sonia'],
      [head, 'ronaldo'],
    ] as const)
      await subscribe(c, who);
  });

  it('Geral avisa todos menos o autor, sem o texto da mensagem', async () => {
    const [general] = await owner<
      { id: string }[]
    >`select id from chat_channels where kind = 'GENERAL'`;
    const res = await h.post(
      `/api/chat/channels/${general!.id}/messages`,
      { body: 'segredo do lead 11987654321' },
      ale,
    );
    expect(res.status).toBe(201);
    const to = push.sent.map((s) => s.endpoint).sort();
    expect(to).toEqual([device('murilo'), device('ronaldo'), device('sonia')]);
    expect(push.sent[0]!.payload).toEqual({
      title: 'Nova mensagem no Chat',
      url: '/chat',
      tag: 'chat',
    });
    expect(JSON.stringify(push.sent)).not.toMatch(/segredo|987654321/);
  });

  it('DM avisa só o destinatário, com o nome de quem mandou', async () => {
    const dm = await h.post('/api/chat/dm', { userId: ids.murilo }, ale);
    await h.post(`/api/chat/channels/${dm.body.id}/messages`, { body: 'oi' }, ale);
    expect(push.sent.map((s) => s.endpoint)).toEqual([device('murilo')]);
    expect(push.sent[0]!.payload.title).toMatch(/^Nova mensagem de /);
  });

  it('inscrição expirada (410) é apagada', async () => {
    push.gone.add(device('murilo'));
    const dm = await h.post('/api/chat/dm', { userId: ids.murilo }, ale);
    await h.post(`/api/chat/channels/${dm.body.id}/messages`, { body: 'oi' }, ale);
    const [row] = await owner<{ n: number }[]>`
      select count(*)::int as n from push_subscriptions where endpoint = ${device('murilo')}`;
    expect(row!.n).toBe(0);
  });

  it('desativar usuário apaga as inscrições dele; sair apaga a do aparelho', async () => {
    const off = await h.patch(`/api/admin/users/${ids.murilo}`, { active: false }, head);
    expect(off.status).toBe(200);
    await owner`update "user" set active = true where id = ${ids.murilo!}`;
    await h.post('/api/push/subscriptions/remove', { endpoint: device('ale') }, ale);
    const rows = await owner<{ endpoint: string }[]>`select endpoint from push_subscriptions`;
    expect(rows.map((r) => r.endpoint).sort()).toEqual([device('ronaldo'), device('sonia')]);
  });

  it('chave pública vem da API', async () => {
    expect((await h.get('/api/push/key', ale)).body).toEqual({ publicKey: 'test-public-key' });
  });
});

describe('confirmação enviada', () => {
  it('só o dono do lead confirma; grava timeline uma vez; liderança vê o que faltou', async () => {
    const m = await schedule(future(50 * MIN));
    const path = `/api/meetings/${m.id}/confirm`;
    expect((await h.post(path, { step: 'H1' }, murilo)).status).toBe(404);
    expect((await h.post(path, { step: 'H1' }, head)).status).toBe(404);
    expect((await h.post(path, { step: 'M1' }, ale)).status).toBe(400);
    expect((await h.post(path, { step: 'H1' }, ale)).status).toBe(200);
    expect((await h.post(path, { step: 'H1' }, ale)).status).toBe(200);
    const timeline = await owner<{ kind: string; fields: string[] }[]>`
      select kind, fields from lead_timeline where kind = 'meeting.confirmed'`;
    expect(timeline).toEqual([{ kind: 'meeting.confirmed', fields: ['step'] }]);
    const list = await h.get(`/api/meetings?leadId=${leadId}`, head);
    expect(list.body[0].confirmations).toEqual(['H1']);
  });

  it('remarcar zera as confirmações; reunião começada ou cancelada recusa', async () => {
    const m = await schedule(future(50 * MIN));
    await h.post(`/api/meetings/${m.id}/confirm`, { step: 'H1' }, ale);
    await h.patch(
      `/api/meetings/${m.id}`,
      { version: 1, scheduledAt: new Date(future(5 * 3600_000)).toISOString() },
      ale,
    );
    const list = await h.get(`/api/meetings?leadId=${leadId}`, head);
    expect(list.body[0].confirmations).toEqual([]);
    await owner`update meetings set scheduled_at = now() - interval '1 minute' where id = ${m.id}`;
    expect((await h.post(`/api/meetings/${m.id}/confirm`, { step: 'M15' }, ale)).status).toBe(400);
    await owner`update meetings set scheduled_at = now() + interval '1 hour' where id = ${m.id}`;
    await h.post(`/api/meetings/${m.id}/cancel`, { version: 2 }, ale);
    expect((await h.post(`/api/meetings/${m.id}/confirm`, { step: 'M15' }, ale)).status).toBe(409);
  });

  it('Avisos e Hoje trazem os lembretes só para o dono do lead', async () => {
    const m = await schedule(future(50 * MIN));
    await h.post(`/api/meetings/${m.id}/confirm`, { step: 'H1' }, ale);
    const mine = await h.get('/api/notifications', ale);
    expect(mine.body.reminders).toMatchObject([
      { id: m.id, leadId, leadName: 'Lead lembrete', confirmed: ['H1'] },
    ]);
    expect((await h.get('/api/notifications', head)).body.reminders).toEqual([]);
    expect((await h.get('/api/notifications', sonia)).body.reminders).toEqual([]);
    const today = await h.post('/api/today/search', {}, head);
    const own = await h.post('/api/today/search', {}, ale);
    // A reunião pode cair amanhã se o teste rodar perto da meia-noite.
    for (const t of today.body.meetings) expect(t.reminders).toBeNull();
    for (const t of own.body.meetings) expect(t.reminders).toEqual({ confirmed: ['H1'] });
  });

  it('não lidas do chat entram nos Avisos', async () => {
    const dm = await h.post('/api/chat/dm', { userId: ids.murilo }, ale);
    await h.post(`/api/chat/channels/${dm.body.id}/messages`, { body: 'oi' }, ale);
    expect((await h.get('/api/notifications', murilo)).body.chatUnread).toBe(1);
    expect((await h.get('/api/notifications', ale)).body.chatUnread).toBe(0);
  });
});

describe('despertador dos lembretes', () => {
  beforeEach(async () => {
    await subscribe(ale, 'ale');
    await subscribe(murilo, 'murilo');
  });

  it('dispara no horário exato de cada etapa, só para o dono, sem contato', async () => {
    const at = future(90 * MIN);
    const m = await schedule(at);
    expect(scheduler.armedAt).toBe(at - 60 * MIN);
    await advance(at - 60 * MIN - 1000);
    expect(push.sent).toEqual([]);
    await advance(at - 60 * MIN);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.endpoint).toBe(device('ale'));
    expect(push.sent[0]!.payload).toMatchObject({
      body: '1 h antes',
      url: '/avisos',
      tag: `meeting-${m.id}`,
    });
    expect(push.sent[0]!.payload.title).toMatch(
      /^Reunião às \d\d:\d\d: mande a confirmação para Lead lembrete$/,
    );
    expect(JSON.stringify(push.sent)).not.toMatch(/987654321|lead\.lembrete/);
    expect(scheduler.armedAt).toBe(at - 15 * MIN);
    await advance(at - 15 * MIN);
    await advance(at - MIN);
    expect(push.sent.map((s) => s.payload.body ?? s.payload.title)).toEqual([
      '1 h antes',
      '15 min antes',
      'Reunião com Lead lembrete começa em 1 min',
    ]);
    expect(scheduler.armedAt).toBeNull();
  });

  it('remarcar rearma para o novo horário; cancelar desarma', async () => {
    const at = future(90 * MIN);
    const m = await schedule(at);
    const later = at + 3 * 3600_000;
    await h.patch(
      `/api/meetings/${m.id}`,
      { version: 1, scheduledAt: new Date(later).toISOString() },
      ale,
    );
    await scheduler.settled();
    expect(scheduler.armedAt).toBe(later - 60 * MIN);
    await h.post(`/api/meetings/${m.id}/cancel`, { version: 2 }, ale);
    await scheduler.settled();
    expect(scheduler.armedAt).toBeNull();
  });

  it('transferir o lead: o lembrete vai para o novo dono', async () => {
    const at = future(90 * MIN);
    await schedule(at);
    await owner`update leads set sdr_id = ${ids.murilo!} where id = ${leadId}`;
    await advance(at - 60 * MIN);
    expect(push.sent.map((s) => s.endpoint)).toEqual([device('murilo')]);
  });

  it('reiniciar a API envia o que venceu parado, uma vez; duas instâncias não duplicam', async () => {
    const at = future(90 * MIN);
    await schedule(at);
    const db = app.get<Db>(DB);
    const service = app.get(PushService);
    // Duas instâncias "subindo" com a API parada desde antes da etapa de 15 min.
    const c1 = new FakeClock();
    const c2 = new FakeClock();
    c1.advanceTo(at - 10 * MIN);
    c2.advanceTo(at - 10 * MIN);
    const a = new ReminderScheduler(db, service, c1);
    const b = new ReminderScheduler(db, service, c2);
    await Promise.all([a.fire(), b.fire()]);
    expect(push.sent.map((s) => s.payload.body)).toEqual(['15 min antes']);
    await a.fire();
    expect(push.sent).toHaveLength(1);
    expect(a.armedAt).toBe(at - MIN);
    a.onModuleDestroy();
    b.onModuleDestroy();
  });
});
