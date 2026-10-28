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
  await owner`truncate payments, deals, lead_notes, lead_tasks, lead_timeline, meetings, leads`;
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
