import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initials } from '../src/collab/handoff.js';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ids: Record<string, string>;
let ale: string, murilo: string, sonia: string, head: string, leadId: string;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, leads`;
  await owner`delete from chat_channels where kind = 'DM'`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
  const res = await h.post(
    '/api/leads',
    {
      name: 'Maria Handoff',
      phone: '11987654321',
      instagram: '@collab.lead',
      incomeBand: 'R8_15K',
      source: 'BIO',
      tier: 'P1',
      summary: 'Quer mentoria',
    },
    ale,
  );
  expect(res.status).toBe(201);
  leadId = res.body.id;
});

const general = async (cookie: string) => {
  const res = await h.get('/api/chat/channels', cookie);
  expect(res.status).toBe(200);
  return res.body.find((c: { kind: string }) => c.kind === 'GENERAL') as {
    id: string;
    unread: number;
  };
};

describe('chat', () => {
  it('Geral: envia, lista com autor e conta não lidas até marcar lido', async () => {
    const g = await general(ale);
    const sent = await h.post(`/api/chat/channels/${g.id}/messages`, { body: '  bom dia  ' }, ale);
    expect(sent.status).toBe(201);
    expect((await general(murilo)).unread).toBe(1);
    expect((await general(ale)).unread).toBe(0);
    const list = await h.get(`/api/chat/channels/${g.id}/messages`, murilo);
    expect(list.body.messages).toEqual([
      expect.objectContaining({ id: sent.body.id, body: 'bom dia', authorName: 'Ale', lead: null }),
    ]);
    expect(
      (await h.post(`/api/chat/channels/${g.id}/read`, { lastReadId: sent.body.id }, murilo))
        .status,
    ).toBe(200);
    expect((await general(murilo)).unread).toBe(0);
  });

  it('valida corpo e esconde canal inexistente/invisível como 404', async () => {
    const g = await general(ale);
    expect((await h.post(`/api/chat/channels/${g.id}/messages`, { body: ' ' }, ale)).status).toBe(
      400,
    );
    expect(
      (await h.post(`/api/chat/channels/${g.id}/messages`, { body: 'x'.repeat(2001) }, ale)).status,
    ).toBe(400);
    expect((await h.get('/api/chat/channels/nao-uuid/messages', ale)).status).toBe(404);
  });

  it('DM é privada e reaproveitada; HEAD não lê DM alheia', async () => {
    const dm = await h.post('/api/chat/dm', { userId: ids.murilo }, ale);
    expect(dm.status).toBe(201);
    expect((await h.post('/api/chat/dm', { userId: ids.ale }, murilo)).body.id).toBe(dm.body.id);
    await h.post(`/api/chat/channels/${dm.body.id}/messages`, { body: 'segredo' }, ale);
    const channels = await h.get('/api/chat/channels', murilo);
    expect(channels.body).toContainEqual(
      expect.objectContaining({ id: dm.body.id, kind: 'DM', name: 'Ale', unread: 1 }),
    );
    expect((await h.get(`/api/chat/channels/${dm.body.id}/messages`, head)).status).toBe(404);
    expect(
      (await h.post(`/api/chat/channels/${dm.body.id}/messages`, { body: 'x' }, head)).status,
    ).toBe(404);
    expect((await h.post('/api/chat/dm', { userId: ids.ale }, ale)).status).toBe(400);
  });

  it('menção #lead só mostra o nome para quem enxerga o lead', async () => {
    const g = await general(ale);
    await h.post(`/api/chat/channels/${g.id}/messages`, { body: 'olha esse', leadId }, ale);
    const mine = await h.get(`/api/chat/channels/${g.id}/messages`, ale);
    expect(mine.body.messages[0].lead).toEqual({ id: leadId, name: 'Maria Handoff' });
    const other = await h.get(`/api/chat/channels/${g.id}/messages`, murilo);
    expect(other.body.messages[0].lead).toEqual({ id: leadId, name: null });
    expect(
      (await h.post(`/api/chat/channels/${g.id}/messages`, { body: 'x', leadId }, murilo)).status,
    ).toBe(400);
  });

  it('lista usuários ativos para DM sem e-mail', async () => {
    const res = await h.get('/api/chat/users', ale);
    expect(res.status).toBe(200);
    expect(res.body.map((u: { id: string }) => u.id)).not.toContain(ids.ale);
    expect(JSON.stringify(res.body)).not.toContain('@');
  });
});

describe('handoff', () => {
  it('sigla são as 2 primeiras letras do nome', () => {
    expect(initials('Igor')).toBe('IG');
    expect(initials('  ana  ')).toBe('AN');
  });

  it('texto sem telefone e link de agenda sem contato', async () => {
    await h.post(
      '/api/meetings',
      {
        leadId,
        closerId: ids.sonia,
        scheduledAt: '2030-01-10T20:00:00-03:00',
        origin: 'DIRETO',
      },
      ale,
    );
    const res = await h.get(`/api/leads/${leadId}/handoff`, ale);
    expect(res.status).toBe(200);
    expect(res.body.text).toContain('Maria Handoff');
    expect(res.body.text).toContain('10/01/2030 20:00');
    expect(res.body.text).toContain('Sônia');
    expect(res.body.text).not.toMatch(/9876|98765/);
    const url = new URL(res.body.calendarUrl);
    expect(url.hostname).toBe('calendar.google.com');
    expect(url.searchParams.get('dates')).toBe('20300110T230000Z/20300110T235900Z');
    // Pedido do cliente (04/11): título com lead, perfil e sigla de quem agendou; descrição = handoff.
    expect(url.searchParams.get('text')).toBe('Reunião Maria Handoff (P1) AL');
    const details = url.searchParams.get('details')!;
    expect(details).toContain('Handoff NPAC');
    expect(details).toContain('SDR: Ale');
    expect(details).toContain('Resumo: Quer mentoria');
    expect(details).toContain(`/leads/${leadId}`);
    expect(res.body.calendarUrl).not.toMatch(/9876|collab\.lead/);
    expect((await h.get(`/api/leads/${leadId}/handoff`, murilo)).status).toBe(404);
  });

  it('reunião em andamento ou sem resultado ainda é a reunião do handoff', async () => {
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${leadId}, ${ids.sonia!}, now() - interval '30 minutes', 'DIRETO', ${ids.ale!})`;
    const res = await h.get(`/api/leads/${leadId}/handoff`, ale);
    expect(res.body.text).not.toContain('a agendar');
    expect(res.body.text).toContain('com Sônia');
    expect(res.body.calendarUrl).not.toBeNull();
    // Com resultado registrado, não há reunião pendente.
    await owner`update meetings set outcome = 'DONE', outcome_at = now() where lead_id = ${leadId}`;
    expect((await h.get(`/api/leads/${leadId}/handoff`, ale)).body.text).toContain('a agendar');
  });

  it('sem reunião futura não há link de agenda', async () => {
    const res = await h.get(`/api/leads/${leadId}/handoff`, ale);
    expect(res.body.calendarUrl).toBeNull();
  });
});

describe('equipe', () => {
  it('membros ativos com papel; SDR vê só os próprios números', async () => {
    const res = await h.get('/api/team', ale);
    expect(res.status).toBe(200);
    const me = res.body.members.find((m: { id: string }) => m.id === ids.ale);
    const other = res.body.members.find((m: { id: string }) => m.id === ids.murilo);
    expect(me).toMatchObject({ name: 'Ale', role: 'SDR', stats: { leads: 1 } });
    expect(other.stats).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('@npac');
    const all = await h.get('/api/team', head);
    expect(all.body.members.find((m: { id: string }) => m.id === ids.murilo).stats).not.toBeNull();
  });

  it('vendas de quem prospecta e também fecha somam, sem contar duas vezes a mesma', async () => {
    const other = await h.post(
      '/api/leads',
      {
        name: 'Lead do Murilo',
        instagram: '@collab.murilo',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
      },
      murilo,
    );
    const third = await h.post(
      '/api/leads',
      {
        name: 'Lead só do Ale',
        instagram: '@collab.ale2',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
      },
      ale,
    );
    const [p] = await owner<{ id: string }[]>`select id from products where code = 'NACAO_PROMO'`;
    // 1) Ale prospectou, Sônia fechou · 2) Murilo prospectou, Ale fechou · 3) Ale fez os dois.
    for (const [lead, sdr, closer, cents] of [
      [leadId, ids.ale!, ids.sonia!, 100_00],
      [other.body.id, ids.murilo!, ids.ale!, 200_00],
      [third.body.id, ids.ale!, ids.ale!, 400_00],
    ] as const) {
      await owner`insert into deals (lead_id, product_id, product_name, catalog_price_cents, closer_id, sdr_id, total_cents, method, request_key, created_by)
        values (${lead}, ${p!.id}, 'Nação', ${cents}, ${closer}, ${sdr}, ${cents}, 'PIX', gen_random_uuid(), ${sdr})`;
    }
    const res = await h.get('/api/team', head);
    const stats = (id: string) =>
      res.body.members.find((m: { id: string }) => m.id === id).stats as {
        sales: number;
        soldCents: number;
      };
    expect(stats(ids.ale!)).toMatchObject({ sales: 3, soldCents: 700_00 });
    expect(stats(ids.sonia!)).toMatchObject({ sales: 1, soldCents: 100_00 });
    expect(stats(ids.murilo!)).toMatchObject({ sales: 1, soldCents: 200_00 });
    // Pedido do cliente (04/11): SDR não vê faturamento, nem o próprio, na Equipe.
    const mine = await h.get('/api/team', ale);
    const own = mine.body.members.find((m: { id: string }) => m.id === ids.ale).stats;
    expect(own).not.toHaveProperty('soldCents');
    const closer = await h.get('/api/team', sonia);
    // Closer continua vendo o próprio faturamento (o valor segue a RLS dele).
    expect(
      closer.body.members.find((m: { id: string }) => m.id === ids.sonia).stats,
    ).toHaveProperty('soldCents');
  });
});

describe('playbook', () => {
  it('todos leem; só HEAD cria/edita com versão e exclui', async () => {
    const list = await h.get('/api/playbook', sonia);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(6);
    const body = { topic: 'Teste', title: 'Objeção nova', body: 'Resposta' };
    expect((await h.post('/api/playbook', body, ale)).status).toBe(403);
    const created = await h.post('/api/playbook', body, head);
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await h.post('/api/playbook', body, head)).status).toBe(409);
    expect((await h.patch(`/api/playbook/${id}`, { version: 1, body: 'Nova' }, ale)).status).toBe(
      403,
    );
    expect((await h.patch(`/api/playbook/${id}`, { version: 1, body: 'Nova' }, head)).status).toBe(
      200,
    );
    expect((await h.patch(`/api/playbook/${id}`, { version: 1, body: 'Velha' }, head)).status).toBe(
      409,
    );
    expect((await h.del(`/api/playbook/${id}`, { version: 2 }, head)).status).toBe(200);
    await owner`delete from playbook_scripts where topic = 'Teste'`;
  });
});
