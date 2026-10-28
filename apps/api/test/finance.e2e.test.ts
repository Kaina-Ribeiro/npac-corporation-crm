import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';
let app: NestFastifyApplication, h: ReturnType<typeof api>;
let ale: string, murilo: string, head: string, leadId: string, productId: string, closerId: string;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, lead_timeline, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled=true where email='ronaldo@npac.com.br'`;
  const [p] = await owner<
    { id: string; closer_id: string }[]
  >`select id, closer_id from products where code='NACAO_PROMO'`;
  productId = p!.id;
  closerId = p!.closer_id;
  leadId = (
    await h.post(
      '/api/leads',
      { name: 'Venda teste', instagram: '@venda.teste', incomeBand: 'R5_10K', tier: 'P1' },
      ale,
    )
  ).body.id;
});
const sale = () => ({
  leadId,
  productId,
  closerId,
  version: 1,
  totalCents: 250000,
  method: 'PARTIAL',
  entryCents: 100000,
  installments: [{ amountCents: 150000, dueAt: '2030-01-01T12:00:00-03:00' }],
  requestKey: randomUUID(),
});
it('catálogo contém os seis produtos', async () =>
  expect((await h.get('/api/finance/products', ale)).body).toHaveLength(6));
it('venda parcial é atômica e repetição não duplica', async () => {
  const input = sale();
  const res = await h.post('/api/finance/deals', input, ale);
  expect(res.status).toBe(201);
  const retry = await h.post('/api/finance/deals', input, ale);
  expect(retry.body.id).toBe(res.body.id);
  const other = await h.post(
    '/api/leads',
    { name: 'Outro comprador', instagram: '@outro.comprador', incomeBand: 'R5_10K', tier: 'P1' },
    murilo,
  );
  expect(
    (await h.post('/api/finance/deals', { ...input, leadId: other.body.id }, murilo)).status,
  ).toBe(409);
  expect((await h.post('/api/finance/deals', { ...input, totalCents: 260000 }, ale)).status).toBe(
    409,
  );
  const detail = await h.get(`/api/finance/leads/${leadId}`, ale);
  expect(detail.status).toBe(200);
  expect(detail.body[0].payments).toHaveLength(2);
  expect((await h.get(`/api/leads/${leadId}`, ale)).body.stageKey).toBe('VENDA');
  expect((await h.get(`/api/finance/leads/${leadId}`, murilo)).status).toBe(404);
});
it('saldo inválido não grava nenhuma venda', async () => {
  expect((await h.post('/api/finance/deals', { ...sale(), entryCents: 1 }, ale)).status).toBe(400);
  const [r] = await owner<{ n: number }[]>`select count(*)::int as n from deals`;
  expect(r!.n).toBe(0);
});
it('baixa é idempotente e só HEAD estorna preservando parcelas', async () => {
  const deal = await h.post('/api/finance/deals', sale(), ale);
  expect(deal.status).toBe(201);
  const detail = await h.get(`/api/finance/leads/${leadId}`, ale);
  const pending = detail.body[0].payments.find((p: { paidAt: string | null }) => !p.paidAt);
  const receipt = { version: 1, requestKey: randomUUID() };
  expect((await h.post(`/api/finance/payments/${pending.id}/receive`, receipt, ale)).status).toBe(
    200,
  );
  expect((await h.post(`/api/finance/payments/${pending.id}/receive`, receipt, ale)).status).toBe(
    200,
  );
  expect(
    (await h.post(`/api/finance/deals/${deal.body.id}/reverse`, { version: 1 }, ale)).status,
  ).toBe(403);
  expect(
    (await h.post(`/api/finance/deals/${deal.body.id}/reverse`, { version: 1 }, head)).status,
  ).toBe(200);
  expect(
    (await h.post(`/api/finance/deals/${deal.body.id}/reverse`, { version: 1 }, head)).status,
  ).toBe(200);
  const rows = await owner`select * from payments where deal_id=${deal.body.id}`;
  expect(rows).toHaveLength(2);
});

it('closer registra venda da agenda, mas não escolhe outro closer', async () => {
  const sonia = await h.signIn('sonia@npac.com.br');
  await owner`insert into meetings (lead_id,closer_id,scheduled_at,origin,created_by) select ${leadId},${closerId},now(),'DIRETO',id from "user" where email='ale@npac.com.br'`;
  const [other] = await owner<
    { id: string; closer_id: string }[]
  >`select id,closer_id from products where code='RDV'`;
  expect(
    (
      await h.post(
        '/api/finance/deals',
        { ...sale(), productId: other!.id, closerId: other!.closer_id },
        sonia,
      )
    ).status,
  ).toBe(403);
  expect((await h.post('/api/finance/deals', sale(), sonia)).status).toBe(201);
});

it('recebimento concorrente com estorno não perde nem duplica parcelas', async () => {
  const res = await h.post('/api/finance/deals', sale(), ale);
  const d = (await h.get(`/api/finance/leads/${leadId}`, ale)).body[0];
  const pending = d.payments.find((p: { paidAt: string | null }) => !p.paidAt);
  const [received, reversed] = await Promise.all([
    h.post(
      `/api/finance/payments/${pending.id}/receive`,
      { version: 1, requestKey: randomUUID() },
      ale,
    ),
    h.post(`/api/finance/deals/${res.body.id}/reverse`, { version: 1 }, head),
  ]);
  expect([200, 409]).toContain(received.status);
  expect(reversed.status).toBe(200);
  expect(await owner`select id from payments where deal_id=${res.body.id}`).toHaveLength(2);
});

it('cobrança vencida aparece só no escopo e sai após recebimento', async () => {
  const d = await h.post('/api/finance/deals', sale(), ale);
  await owner`update payments set due_at=now() where deal_id=${d.body.id} and paid_at is null`;
  const charges = (await h.post('/api/today/search', {}, ale)).body.charges;
  expect(charges).toHaveLength(1);
  expect(charges[0].amountCents).toBe(150000);
  expect((await h.post('/api/today/search', {}, murilo)).body.charges).toHaveLength(0);
  await h.post(
    `/api/finance/payments/${charges[0].id}/receive`,
    { version: 1, requestKey: randomUUID() },
    ale,
  );
  expect((await h.post('/api/today/search', {}, ale)).body.charges).toHaveLength(0);
});

it('lead com venda ativa exige estorno antes de exclusão', async () => {
  expect((await h.post('/api/finance/deals', sale(), ale)).status).toBe(201);
  expect((await h.del('/api/leads/' + leadId, { version: 2 }, head)).status).toBe(409);
  expect((await h.get('/api/leads/' + leadId, head)).status).toBe(200);
});

it.each(['CARD', 'PIX', 'BANK_SLIP'] as const)(
  'forma %s concilia pagamentos e saldo',
  async (method) => {
    const input = {
      ...sale(),
      method,
      entryCents: 0,
      installments:
        method === 'BANK_SLIP' ? [{ amountCents: 250000, dueAt: '2030-01-01T12:00:00-03:00' }] : [],
    };
    expect((await h.post('/api/finance/deals', input, ale)).status).toBe(201);
    const d = (await h.get('/api/finance/leads/' + leadId, ale)).body[0];
    expect(d.payments).toHaveLength(1);
    expect(d.payments[0].amountCents).toBe(250000);
    expect(d.payments[0].paidAt === null).toBe(method === 'BANK_SLIP');
  },
);
