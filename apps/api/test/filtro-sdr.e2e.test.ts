import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

// NPAC-66 (Igor, 23/11/2026): cada SDR vê só os próprios números; a liderança vê todos. Com o
// `sdrId` de outro SDR, o SDR recebe os dados dele mesmo (o servidor ignora o pedido).
let app: NestFastifyApplication, h: ReturnType<typeof api>;
let ale: string, murilo: string, head: string, aleId: string, muriloId: string;
let aleLead: string, muriloLead: string;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, sdr_sale_marks, leads`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  const ids = await owner<{ id: string; email: string }[]>`
    select id, email from "user" where email in ('ale@npac.com.br', 'murilo@npac.com.br')`;
  aleId = ids.find((u) => u.email.startsWith('ale'))!.id;
  muriloId = ids.find((u) => u.email.startsWith('murilo'))!.id;
  const create = async (cookie: string, instagram: string) => {
    const r = await h.post(
      '/api/leads',
      { name: `Filtro ${instagram}`, instagram, incomeBand: 'R8_15K', source: 'BIO' },
      cookie,
    );
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.id as string;
  };
  aleLead = await create(ale, '@filtro.ale');
  muriloLead = await create(murilo, '@filtro.murilo');
});

describe('relatório do SDR', () => {
  it('com o sdrId de outro SDR, devolve os números do próprio SDR', async () => {
    const own = await h.post('/api/reports/search', { period: 'TODAY' }, ale);
    const other = await h.post('/api/reports/search', { period: 'TODAY', sdrId: muriloId }, ale);
    expect(own.status).toBe(200);
    expect(other.status).toBe(200);
    expect(other.body.metrics.leads).toBe(1);
    expect(other.body.leads.map((l: { id: string }) => l.id)).toEqual([aleLead]);
    expect(other.body.bySdr.map((r: { id: string }) => r.id)).toEqual([aleId]);
    expect(other.body.metrics).toEqual(own.body.metrics);
    expect(other.body.bySdr).toEqual(own.body.bySdr);
  });

  it('o resumo e o relatório do período também ficam no próprio SDR', async () => {
    const summary = await h.post('/api/reports/summary', { period: 'TODAY', sdrId: muriloId }, ale);
    expect(summary.status).toBe(200);
    const own = await h.post('/api/reports/summary', { period: 'TODAY' }, ale);
    expect(summary.body.text).toBe(own.body.text);
    const exp = await h.post('/api/reports/export', { period: 'TODAY', sdrId: muriloId }, ale);
    expect(exp.status).toBe(200);
    expect(exp.text).toContain('"Leads novos";"1"');
    expect(exp.text).not.toContain('Murilo');
  });

  it('a liderança continua filtrando por qualquer SDR', async () => {
    const r = await h.post('/api/reports/search', { period: 'TODAY', sdrId: muriloId }, head);
    expect(r.status).toBe(200);
    expect(r.body.leads.map((l: { id: string }) => l.id)).toEqual([muriloLead]);
    const all = await h.post('/api/reports/search', { period: 'TODAY' }, head);
    expect(all.body.metrics.leads).toBe(2);
  });
});

describe('leads e Pipeline do SDR', () => {
  const ids = (r: { body: { items: { id: string }[] } }) => r.body.items.map((l) => l.id);

  it('lista e busca com o sdrId de outro SDR trazem os leads do próprio SDR', async () => {
    const list = await h.get(`/api/leads?sdrId=${muriloId}`, ale);
    expect(list.status).toBe(200);
    expect(ids(list)).toEqual([aleLead]);
    const search = await h.post('/api/leads/search', { sdrId: muriloId }, ale);
    expect(search.status).toBe(200);
    expect(ids(search)).toEqual([aleLead]);
  });

  it('Pipeline com o sdrId de outro SDR traz os leads do próprio SDR', async () => {
    const r = await h.post('/api/leads/pipeline/search', { sdrId: muriloId }, ale);
    expect(r.status).toBe(200);
    const all = (r.body as { items: { id: string }[] }[]).flatMap((c) => c.items.map((l) => l.id));
    expect(all).toEqual([aleLead]);
  });

  it('a liderança continua filtrando leads por qualquer SDR', async () => {
    const r = await h.post('/api/leads/search', { sdrId: muriloId }, head);
    expect(ids(r)).toEqual([muriloLead]);
  });

  it('o catálogo diz ao SDR que o filtro de SDR fica só com ele', async () => {
    const mine = await h.get('/api/leads/catalog', ale);
    expect(mine.body.sdrFixo).toBe('Ale');
    expect((await h.get('/api/leads/catalog', head)).body.sdrFixo).toBeUndefined();
    expect((await h.get('/api/leads/catalog', murilo)).body.sdrFixo).toBe('Murilo');
  });
});
