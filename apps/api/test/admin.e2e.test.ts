import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ids: Record<string, string>;
let ale: string, head: string;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await owner`delete from account where user_id in (select id from "user" where email like '%@novo.test')`;
  await owner`delete from "user" where email like '%@novo.test'`;
  await owner`update products set active = true, price_cents = 250000 where code = 'NACAO_PROMO'`;
  await owner`update pipeline_stages set label = 'Sondagem' where key = 'SONDAGEM'`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meetings, leads`;
  await owner`update "user" set active = true`;
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
  ale = await h.signIn('ale@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
});

describe('usuários', () => {
  it('só HEAD administra', async () => {
    expect((await h.get('/api/admin/users', ale)).status).toBe(403);
    const res = await h.get('/api/admin/users', head);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
  });

  it('convida com senha temporária, troca obrigatória e login funcionando', async () => {
    const res = await h.post(
      '/api/admin/users',
      {
        name: 'Nova SDR',
        email: 'nova@novo.test',
        role: 'SDR',
        canProspect: true,
        canClose: false,
      },
      head,
    );
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    const login = await h.signInRaw('nova@novo.test', res.body.temporaryPassword);
    expect(login.status).toBe(200);
    const [u] = await owner<
      { must_change_password: boolean }[]
    >`select must_change_password from "user" where email = 'nova@novo.test'`;
    expect(u!.must_change_password).toBe(true);
    expect(
      (
        await h.post(
          '/api/admin/users',
          { name: 'Dup', email: 'nova@novo.test', role: 'SDR', canProspect: true, canClose: false },
          head,
        )
      ).status,
    ).toBe(409);
  });

  it('desativar derruba sessão; HEAD não desativa a si mesmo', async () => {
    expect((await h.patch(`/api/admin/users/${ids.ale}`, { active: false }, head)).status).toBe(
      200,
    );
    expect((await h.get('/api/me', ale)).status).toBe(401);
    expect((await h.patch(`/api/admin/users/${ids.ronaldo}`, { active: false }, head)).status).toBe(
      400,
    );
    expect((await h.patch(`/api/admin/users/${ids.ronaldo}`, { role: 'SDR' }, head)).status).toBe(
      400,
    );
  });

  it('reset de MFA e de senha encerram sessões e exigem novo passo', async () => {
    await owner`update "user" set two_factor_enabled = true where id = ${ids.ana!}`;
    expect((await h.post(`/api/admin/users/${ids.ana}/reset-mfa`, {}, head)).status).toBe(200);
    const [a] = await owner<
      { two_factor_enabled: boolean }[]
    >`select two_factor_enabled from "user" where id = ${ids.ana!}`;
    expect(a!.two_factor_enabled).toBe(false);
    const reset = await h.post(`/api/admin/users/${ids.ale}/reset-password`, {}, head);
    expect(reset.status).toBe(200);
    expect((await h.get('/api/me', ale)).status).toBe(401);
    expect((await h.signInRaw('ale@npac.com.br', reset.body.temporaryPassword)).status).toBe(200);
    await owner`update account set password = (select password from account a2 join "user" u on u.id = a2.user_id where u.email = 'sonia@npac.com.br') where user_id = ${ids.ale!}`;
  });
});

describe('catálogo e etapas', () => {
  it('HEAD altera preço e desativa produto sem mudar vendas antigas', async () => {
    const list = await h.get('/api/admin/products', head);
    const promo = list.body.find((p: { code: string }) => p.code === 'NACAO_PROMO');
    expect(
      (await h.patch(`/api/admin/products/${promo.id}`, { priceCents: 260000 }, head)).status,
    ).toBe(200);
    expect(
      (await h.patch(`/api/admin/products/${promo.id}`, { closerId: ids.ale }, head)).status,
    ).toBe(400);
    expect((await h.patch(`/api/admin/products/${promo.id}`, { active: false }, head)).status).toBe(
      200,
    );
    const catalog = await h.get('/api/finance/products', ale);
    expect(catalog.body.map((p: { id: string }) => p.id)).not.toContain(promo.id);
    expect((await h.patch(`/api/admin/products/${promo.id}`, { priceCents: 1 }, ale)).status).toBe(
      403,
    );
  });

  it('renomeia etapa sem trocar a chave', async () => {
    const stages = await h.get('/api/admin/stages', head);
    const s = stages.body.find((x: { key: string }) => x.key === 'SONDAGEM');
    expect(
      (await h.patch(`/api/admin/stages/${s.id}`, { label: 'Primeiro contato' }, head)).status,
    ).toBe(200);
    expect(
      (await h.get('/api/admin/stages', head)).body.find((x: { id: string }) => x.id === s.id)
        .label,
    ).toBe('Primeiro contato');
  });
});

describe('auditoria e LGPD', () => {
  it('auditoria paginada só para HEAD, filtrável por ação', async () => {
    expect((await h.post('/api/admin/audit/search', {}, ale)).status).toBe(403);
    const res = await h.post('/api/admin/audit/search', { action: 'auth.sign_in.success' }, head);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(
      res.body.items.every((i: { action: string }) => i.action === 'auth.sign_in.success'),
    ).toBe(true);
  });

  it('acesso exporta dados do titular; eliminação anonimiza ao concluir', async () => {
    const lead = await h.post(
      '/api/leads',
      { name: 'Titular Teste', phone: '11955554444', incomeBand: 'R5_8K', tier: 'P2' },
      ale,
    );
    const access = await h.post(
      '/api/admin/lgpd',
      { kind: 'ACCESS', leadId: lead.body.id, description: 'Pediu cópia dos dados' },
      head,
    );
    expect(access.status).toBe(201);
    const exp = await h.get(`/api/admin/lgpd/${access.body.id}/export`, head);
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toContain('attachment');
    expect(exp.body.lead.phone).toBe('+5511955554444');
    const del = await h.post(
      '/api/admin/lgpd',
      { kind: 'DELETION', leadId: lead.body.id, description: 'Pediu eliminação' },
      head,
    );
    expect(
      (
        await h.post(
          `/api/admin/lgpd/${del.body.id}/resolve`,
          { status: 'DONE', resolution: 'Anonimizado' },
          head,
        )
      ).status,
    ).toBe(200);
    const [l] = await owner<
      { name: string; phone_enc: Buffer | null }[]
    >`select name, phone_enc from leads where id = ${lead.body.id}`;
    expect(l).toEqual({ name: 'Titular anonimizado', phone_enc: null });
    const list = await h.get('/api/admin/lgpd', head);
    expect(list.body.find((r: { id: string }) => r.id === del.body.id).status).toBe('DONE');
    expect((await h.get('/api/admin/lgpd', ale)).status).toBe(403);
  });
});
