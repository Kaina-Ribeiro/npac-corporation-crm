import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';
let app: NestFastifyApplication, h: ReturnType<typeof api>, ale: string, head: string;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  const murilo = await h.signIn('murilo@npac.com.br');
  await owner`update "user" set two_factor_enabled=true where email='ronaldo@npac.com.br'`;
  const [p] = await owner<
    { id: string; closer_id: string }[]
  >`select id,closer_id from products where code='NACAO_PROMO'`;
  for (const [cookie, insta, name, totalCents] of [
    [ale, '@rel.ale', '=SUM(1,1)', 250000],
    [murilo, '@rel.murilo', 'Outro lead', 300000],
  ] as const) {
    const lead = await h.post(
      '/api/leads',
      { name, instagram: insta, incomeBand: 'R5_8K', tier: 'P1' },
      cookie,
    );
    expect(
      (
        await h.post(
          '/api/finance/deals',
          {
            leadId: lead.body.id,
            productId: p!.id,
            closerId: p!.closer_id,
            version: 1,
            totalCents,
            method: 'PIX',
            requestKey: randomUUID(),
          },
          cookie,
        )
      ).status,
    ).toBe(201);
    if (cookie === ale)
      await owner`insert into meetings (lead_id,closer_id,scheduled_at,origin,outcome,outcome_at,created_by)
   select ${lead.body.id},${p!.closer_id},now(),'DIRETO','DONE',now(),u.id from "user" u cross join generate_series(1,2) where u.email='ale@npac.com.br'`;
  }
});
it('SQL não duplica faturamento ao juntar duas reuniões e respeita escopo', async () => {
  const mine = await h.post('/api/reports/search', { period: 'TODAY' }, ale);
  expect(mine.status).toBe(200);
  expect(mine.body.bySdr[0]).toMatchObject({ p1: 1, direct: 2, follow: 0 });
  expect(mine.body.byCloser[0].conversionBps).toBe(5000);
  expect(mine.body.byProduct[0].ticketCents).toBe(250000);
  expect(mine.body.metrics).toMatchObject({
    soldCents: 250000,
    receivedCents: 250000,
    sales: 1,
    meetings: 2,
    done: 2,
  });
  expect(
    (await h.post('/api/reports/search', { period: 'TODAY' }, head)).body.metrics.soldCents,
  ).toBe(550000);
  const a = await h.post('/api/reports/search', { period: 'TODAY', page: 1, pageSize: 1 }, head);
  const b = await h.post('/api/reports/search', { period: 'TODAY', page: 2, pageSize: 1 }, head);
  expect(a.body.totalLeads).toBe(2);
  expect(a.body.leads).toHaveLength(1);
  expect(b.body.leads[0].id).not.toBe(a.body.leads[0].id);
  expect(b.body.metrics.soldCents).toBe(550000);
});
it('CSV só HEAD e neutraliza fórmula; resumo não inclui contato', async () => {
  expect((await h.post('/api/reports/csv', { period: 'TODAY' }, ale)).status).toBe(403);
  const csv = await h.post('/api/reports/csv', { period: 'TODAY' }, head);
  expect(csv.status).toBe(200);
  expect(csv.text).toContain("'=SUM(1,1)");
  const r = await h.post('/api/reports/summary', { period: 'TODAY' }, ale);
  expect(r.status).toBe(200);
  expect(r.body.text).not.toContain('rel.ale');
});
it('leads excluídos não entram em métricas, linhas nem CSV do HEAD', async () => {
  const gone = await h.post(
    '/api/leads',
    { name: 'Lead excluído', instagram: '@rel.gone', incomeBand: 'R5_8K', tier: 'P0' },
    ale,
  );
  expect(gone.status).toBe(201);
  await owner`update leads set deleted_at=now() where id=${gone.body.id}`;
  const r = await h.post('/api/reports/search', { period: 'TODAY' }, head);
  expect(r.body.metrics).toMatchObject({ leads: 2, p0: 0 });
  expect(r.body.leads.map((l: { id: string }) => l.id)).not.toContain(gone.body.id);
  const csv = await h.post('/api/reports/csv', { period: 'TODAY' }, head);
  expect(csv.text).not.toContain('rel.gone');
});

it('série diária do período fecha com as métricas e cobre todos os dias', async () => {
  const r = await h.post(
    '/api/reports/search',
    { period: 'RANGE', from: '2026-01-01', to: '2030-12-31' },
    head,
  );
  expect(r.status).toBe(400);
  const month = await h.post('/api/reports/search', { period: 'MONTH' }, head);
  const days: {
    date: string;
    leads: number;
    meetings: number;
    soldCents: number;
    receivedCents: number;
  }[] = month.body.daily;
  expect(days.length).toBeGreaterThanOrEqual(1);
  expect(days.at(-1)!.date).toBe(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
  );
  const sum = (k: 'leads' | 'meetings' | 'soldCents' | 'receivedCents') =>
    days.reduce((a, d) => a + d[k], 0);
  expect(sum('soldCents')).toBe(month.body.metrics.soldCents);
  expect(sum('receivedCents')).toBe(month.body.metrics.receivedCents);
  expect(sum('leads')).toBe(month.body.metrics.leads);
  expect(sum('meetings')).toBe(month.body.metrics.meetings);
  const mine = await h.post('/api/reports/search', { period: 'MONTH' }, ale);
  expect(mine.body.daily.reduce((a: number, d: { soldCents: number }) => a + d.soldCents, 0)).toBe(
    250000,
  );
});

it('traz o período anterior de mesmo tamanho para comparar o faturamento', async () => {
  await owner`update deals set closed_at = (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month' + interval '12 hours') at time zone 'America/Sao_Paulo'
    where total_cents = 300000`;
  const r = await h.post('/api/reports/search', { period: 'MONTH' }, head);
  expect(r.body.previousDaily).toHaveLength(r.body.daily.length);
  const prev = r.body.previousDaily.reduce(
    (a: number, d: { soldCents: number }) => a + d.soldCents,
    0,
  );
  expect(prev).toBe(300000);
  expect(r.body.metrics.soldCents).toBe(250000);
  const mine = await h.post('/api/reports/search', { period: 'MONTH' }, ale);
  expect(
    mine.body.previousDaily.reduce((a: number, d: { soldCents: number }) => a + d.soldCents, 0),
  ).toBe(0);
});

it('atividade da equipe: só Head vê, mais recente primeiro, com quem fez e qual lead', async () => {
  expect((await h.get('/api/reports/activity', ale)).status).toBe(403);
  const r = await h.get('/api/reports/activity', head);
  expect(r.status).toBe(200);
  expect(r.body.items.length).toBeGreaterThan(0);
  expect(r.body.items.length).toBeLessThanOrEqual(8);
  const [first] = r.body.items;
  expect(first).toMatchObject({ kind: 'sale.registered', actorName: expect.any(String) });
  expect(first.leadName).toBe('Outro lead');
  const at = r.body.items.map((i: { at: string }) => i.at);
  expect([...at].sort().reverse()).toEqual(at);
  expect(Object.keys(first).sort()).toEqual(
    ['actorName', 'at', 'id', 'kind', 'leadId', 'leadName'].sort(),
  );
});
