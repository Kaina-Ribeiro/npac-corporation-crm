import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Db, DbClient } from '@npac/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB, DB_SQL } from '../src/common/db/db.module.js';
import { PUSH_SENDER, PushService } from '../src/push/push.service.js';
import { ReminderScheduler } from '../src/push/reminders.js';
import { SinoPush } from '../src/push/sino-push.js';
import {
  api,
  closeTestApp,
  createTestApp,
  type MemoryPushSender,
  owner,
  resetAuthState,
} from './helpers.js';

/** Push de todo aviso do sino (NPAC-48, B2). */
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ids: Record<string, string>;
let ale: string, sonia: string, murilo: string, head: string, leadId: string;
let push: MemoryPushSender;
let sino: SinoPush;

/** Tipos que o gatilho `notify_from_timeline` põe no sino (0047), com a frase da tela. */
const SINO: [string, string][] = [
  ['lead.created', 'cadastrou'],
  ['lead.reassigned', 'trocou o responsável de'],
  ['note.created', 'anotou em'],
  ['meeting.scheduled', 'agendou'],
  ['meeting.rescheduled', 'remarcou a reunião de'],
  ['meeting.canceled', 'cancelou a reunião de'],
  ['meeting.outcome', 'registrou o resultado da reunião de'],
  ['sale.registered', 'registrou a venda de'],
  ['sale.pending', 'pediu o registro da venda de'],
  ['sale.reversed', 'estornou a venda de'],
  ['payment.pending', 'pediu para completar o pagamento de'],
  ['payment.received', 'recebeu um pagamento de'],
];

const device = (who: string) => `https://push.test/${who}`;
const avisos = () => push.sent.filter((s) => s.payload.tag.startsWith('aviso-'));

async function subscribe(cookie: string, who: string) {
  const res = await h.post(
    '/api/push/subscriptions',
    { endpoint: device(who), keys: { p256dh: `p-${who}`, auth: `a-${who}` } },
    cookie,
  );
  expect(res.status).toBe(200);
}
/** Eventos na timeline do lead, como se `actor` tivesse feito (uma transação só). */
async function timeline(actor: string, kinds: string[]) {
  await owner`insert into lead_timeline (lead_id, kind, actor_id)
    select ${leadId}, k, ${actor} from unnest(${kinds}::text[]) k`;
}

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  push = app.get(PUSH_SENDER);
  sino = app.get(SinoPush);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate push_subscriptions, notification_pushes, lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, sdr_sale_marks, leads`;
  ale = await h.signIn('ale@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  const res = await h.post(
    '/api/leads',
    {
      name: 'Lead aviso',
      phone: '11987654322',
      instagram: '@lead.aviso',
      email: 'lead.aviso@exemplo.com',
      incomeBand: 'R5_8K',
      source: 'BIO',
    },
    ale,
  );
  expect(res.status).toBe(201);
  leadId = res.body.id;
  for (const [c, who] of [
    [ale, 'ale'],
    [sonia, 'sonia'],
    [murilo, 'murilo'],
    [head, 'ronaldo'],
  ] as const)
    await subscribe(c, who);
  await sino.settled();
  await app.get(ReminderScheduler).settled();
  push.sent = [];
  push.gone.clear();
});

describe('push do sino', () => {
  it('cada tipo do sino vira push com a frase da tela, sem contato', async () => {
    await timeline(
      ids.sonia!,
      SINO.map(([k]) => k),
    );
    await vi.waitFor(() => expect(avisos()).toHaveLength(SINO.length), { timeout: 5000 });
    await sino.settled();
    expect(new Set(avisos().map((s) => s.endpoint))).toEqual(new Set([device('ale')]));
    expect(
      avisos()
        .map((s) => s.payload.title)
        .sort(),
    ).toEqual(SINO.map(([, verb]) => `Sônia ${verb} Lead aviso`).sort());
    for (const s of avisos()) {
      expect(s.payload.url).toBe(`/leads/${leadId}`);
      expect(s.payload.body).toBeUndefined();
    }
    const tags = await owner<{ tag: string }[]>`
      select 'aviso-' || id as tag from lead_timeline where lead_id = ${leadId} and actor_id = ${ids.sonia!}`;
    expect(
      avisos()
        .map((s) => s.payload.tag)
        .sort(),
    ).toEqual(tags.map((t) => t.tag).sort());
    expect(JSON.stringify(push.sent)).not.toMatch(/987654322|lead\.aviso|exemplo|R\$/);
  });

  it('o formulário não ganha um segundo push (o webhook já manda o dele)', async () => {
    await timeline(ids.sonia!, ['form.received', 'note.created']);
    await vi.waitFor(() => expect(avisos()).toHaveLength(1), { timeout: 5000 });
    await sino.settled();
    expect(avisos()[0]!.payload.title).toBe('Sônia anotou em Lead aviso');
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from notifications`;
    expect(n!.n).toBeGreaterThan(1); // o formulário entrou no sino, só não virou push aqui
  });

  it('vai para quem recebe o aviso: o closer sim; o autor e a liderança não', async () => {
    const res = await h.post(
      '/api/meetings',
      {
        leadId,
        closerId: ids.sonia,
        scheduledAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
        origin: 'DIRETO',
      },
      ale,
    );
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(avisos()).toHaveLength(1), { timeout: 5000 });
    await sino.settled();
    expect(avisos()).toEqual([
      {
        endpoint: device('sonia'),
        payload: expect.objectContaining({
          title: 'Ale agendou Lead aviso',
          url: `/leads/${leadId}`,
        }),
      },
    ]);
  });

  it('um push por aviso, mesmo com duas instâncias e com a recuperação', async () => {
    const outra = new SinoPush(
      app.get<Db>(DB),
      app.get<DbClient['sql']>(DB_SQL),
      app.get(PushService),
    );
    await outra.start();
    try {
      await timeline(ids.sonia!, ['note.created']);
      await vi.waitFor(() => expect(avisos()).toHaveLength(1), { timeout: 5000 });
      await Promise.all([sino.settled(), outra.settled()]);
      // Reconectar recupera os últimos 10 min: o que já foi não volta.
      await outra.stop();
      await outra.start();
      await outra.settled();
      expect(avisos()).toHaveLength(1);
    } finally {
      await outra.stop();
    }
  });

  it('ao subir, manda o que ficou sem push nos últimos 10 min; lido e antigo não', async () => {
    await sino.stop();
    try {
      await timeline(ids.sonia!, ['note.created', 'meeting.scheduled', 'sale.registered']);
      await owner`update notifications n set read_at = now() from lead_timeline t
        where t.id = n.timeline_id and t.kind = 'meeting.scheduled'`;
      await owner`update notifications n set created_at = now() - interval '11 minutes'
        from lead_timeline t where t.id = n.timeline_id and t.kind = 'sale.registered'`;
      expect(avisos()).toEqual([]);
    } finally {
      await sino.start();
    }
    await vi.waitFor(() => expect(avisos()).toHaveLength(1), { timeout: 5000 });
    await sino.settled();
    expect(avisos()[0]!.payload.title).toBe('Sônia anotou em Lead aviso');
  });

  it('lead fora do acesso de quem recebe: push sem o nome', async () => {
    await timeline(ids.sonia!, ['note.created']);
    await vi.waitFor(() => expect(avisos()).toHaveLength(1), { timeout: 5000 });
    await sino.settled();
    // Mesma reivindicação, agora com o lead de outro SDR: o nome não sai.
    await owner`update leads set sdr_id = ${ids.murilo!} where id = ${leadId}`;
    await sino.stop();
    try {
      await timeline(ids.murilo!, ['note.created']); // aviso para o novo dono? Não: ele é o autor.
      await owner`insert into notifications (user_id, timeline_id)
        select ${ids.ale!}, id from lead_timeline where actor_id = ${ids.murilo!}`;
    } finally {
      await sino.start();
    }
    await vi.waitFor(() => expect(avisos()).toHaveLength(2), { timeout: 5000 });
    await sino.settled();
    expect(avisos()[1]).toEqual({
      endpoint: device('ale'),
      payload: expect.objectContaining({
        title: 'Murilo anotou em um lead fora do seu acesso',
        url: '/avisos',
      }),
    });
  });
});
