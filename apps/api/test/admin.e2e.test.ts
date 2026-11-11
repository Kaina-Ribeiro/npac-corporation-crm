import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  await owner`update "user" set role = 'HEAD', two_factor_enabled = false where email = 'ana@npac.com.br'`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, leads`;
  await owner`update "user" set active = true`;
  await owner`update "user" set role = 'HEAD' where email = 'ana@npac.com.br'`;
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
        username: 'nova',
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
    const badUsername = await h.post(
      '/api/admin/users',
      {
        name: 'Espaço',
        email: 'espaco@novo.test',
        username: 'com espaço',
        role: 'SDR',
        canProspect: true,
        canClose: false,
      },
      head,
    );
    expect(badUsername.status).toBe(400);
    expect(
      (
        await h.post(
          '/api/admin/users',
          {
            name: 'Dup',
            email: 'nova@novo.test',
            username: 'nova',
            role: 'SDR',
            canProspect: true,
            canClose: false,
          },
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

  it('passa os leads de quem saiu para outro SDR, com registro na timeline', async () => {
    const lead = await h.post(
      '/api/leads',
      {
        name: 'Lead da Ale',
        instagram: '@lead.da.ale',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
      },
      ale,
    );
    expect(lead.status).toBe(201);
    await h.patch(`/api/admin/users/${ids.ale}`, { active: false }, head);
    const listed = await h.get('/api/admin/users', head);
    expect(listed.body.find((u: { id: string }) => u.id === ids.ale).leads).toBe(1);
    // Closer que não prospecta não recebe leads.
    expect(
      (await h.post(`/api/admin/users/${ids.ale}/transfer-leads`, { to: ids.sonia }, head)).status,
    ).toBe(400);
    const moved = await h.post(
      `/api/admin/users/${ids.ale}/transfer-leads`,
      { to: ids.murilo },
      head,
    );
    expect(moved.status).toBe(200);
    expect(moved.body.moved).toBe(1);
    const [row] = await owner<
      { sdr_id: string }[]
    >`select sdr_id from leads where id=${lead.body.id}`;
    expect(row!.sdr_id).toBe(ids.murilo);
    const events =
      await owner`select 1 from lead_timeline where lead_id=${lead.body.id} and kind='lead.reassigned'`;
    expect(events).toHaveLength(1);
    expect(
      (await h.post(`/api/admin/users/${ids.ale}/transfer-leads`, { to: ids.murilo }, ale)).status,
    ).toBe(401);
  });

  it('reset de MFA e de senha encerram sessões e exigem novo passo', async () => {
    await owner`update "user" set two_factor_enabled = true where id = ${ids.sonia!}`;
    expect((await h.post(`/api/admin/users/${ids.sonia}/reset-mfa`, {}, head)).status).toBe(200);
    const [a] = await owner<
      { two_factor_enabled: boolean }[]
    >`select two_factor_enabled from "user" where id = ${ids.sonia!}`;
    expect(a!.two_factor_enabled).toBe(false);
    const reset = await h.post(`/api/admin/users/${ids.ale}/reset-password`, {}, head);
    expect(reset.status).toBe(200);
    expect((await h.get('/api/me', ale)).status).toBe(401);
    expect((await h.signInRaw('ale@npac.com.br', reset.body.temporaryPassword)).status).toBe(200);
    await owner`update account set password = (select password from account a2 join "user" u on u.id = a2.user_id where u.email = 'sonia@npac.com.br') where user_id = ${ids.ale!}`;
  });
});

describe('Diretoria', () => {
  const asDiretor = async () => {
    await owner`update "user" set role = 'DIRETOR' where email = 'ana@npac.com.br'`;
    const s = await h.signIn('ana@npac.com.br');
    // MFA ativado depois do login (como no teste do Head) para não pedir o código aqui.
    await owner`update "user" set two_factor_enabled = true where email = 'ana@npac.com.br'`;
    return s;
  };

  it('Head não mexe em Head nem cria Head', async () => {
    const promote = await h.patch(`/api/admin/users/${ids.ale}`, { role: 'HEAD' }, head);
    expect(promote.status).toBe(403);
    const invite = await h.post(
      '/api/admin/users',
      {
        name: 'Outro Head',
        email: 'head@novo.test',
        username: 'outrohead',
        role: 'HEAD',
        canProspect: false,
        canClose: true,
      },
      head,
    );
    expect(invite.status).toBe(403);
    expect((await h.patch(`/api/admin/users/${ids.ana}`, { active: false }, head)).status).toBe(
      403,
    );
    expect((await h.post(`/api/admin/users/${ids.ana}/reset-password`, {}, head)).status).toBe(403);
    expect((await h.post(`/api/admin/users/${ids.ana}/reset-mfa`, {}, head)).status).toBe(403);
    // Continua gerenciando SDR e closer (o cargo define as caixas deles).
    expect((await h.patch(`/api/admin/users/${ids.ale}`, { role: 'CLOSER' }, head)).status).toBe(
      200,
    );
    expect((await h.patch(`/api/admin/users/${ids.ale}`, { role: 'SDR' }, head)).status).toBe(200);
  });

  it('Diretoria promove e rebaixa Head e vê tudo como Head', async () => {
    const diretor = await asDiretor();
    expect((await h.patch(`/api/admin/users/${ids.ale}`, { role: 'HEAD' }, diretor)).status).toBe(
      200,
    );
    expect((await h.patch(`/api/admin/users/${ids.ale}`, { role: 'SDR' }, diretor)).status).toBe(
      200,
    );
    expect((await h.get('/api/me', diretor)).body.role).toBe('DIRETOR');
    // Mesmo acesso de dados do Head (RLS) e às telas de Head.
    const lead = await h.post(
      '/api/leads',
      {
        name: 'Lead da diretoria',
        instagram: '@diretoria.e2e',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
        sdrId: ids.ale,
      },
      diretor,
    );
    expect(lead.status).toBe(201);
    const mine = await h.post('/api/leads/search', { search: 'diretoria' }, diretor);
    expect(mine.body.total).toBe(1);
    expect((await h.get('/api/reports/activity', diretor)).status).toBe(200);
    // Não remove o próprio cargo.
    expect((await h.patch(`/api/admin/users/${ids.ana}`, { role: 'HEAD' }, diretor)).status).toBe(
      400,
    );
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
      {
        name: 'Titular Teste',
        phone: '11955554444',
        email: 'titular@exemplo.com',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P2',
      },
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
    expect(exp.body.lead.email).toBe('titular@exemplo.com');
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
      {
        name: string;
        phone_enc: Buffer | null;
        email_enc: Buffer | null;
        email_bidx: string | null;
      }[]
    >`select name, phone_enc, email_enc, email_bidx from leads where id = ${lead.body.id}`;
    expect(l).toEqual({
      name: 'Titular anonimizado',
      phone_enc: null,
      email_enc: null,
      email_bidx: null,
    });
    const list = await h.get('/api/admin/lgpd', head);
    expect(list.body.find((r: { id: string }) => r.id === del.body.id).status).toBe('DONE');
    expect((await h.get('/api/admin/lgpd', ale)).status).toBe(403);
  });
});

describe('colunas do pipeline (pedido do cliente de 04/11)', () => {
  const SEED = [
    'SONDAGEM',
    'AGENDADO_DIRETO',
    'EM_FOLLOW',
    'AGENDADO_FOLLOW',
    'AGENDOU_PAGAMENTO',
    'NO_SHOW',
    'VENDA',
    'PERDIDO',
  ];
  afterEach(async () => {
    await owner`truncate lead_timeline, notifications, form_responses, leads cascade`;
    await owner`delete from pipeline_stages where not system`;
    for (const [i, key] of SEED.entries())
      await owner`update pipeline_stages set position = ${i + 1} where key = ${key}`;
  });
  const catalog = async () =>
    (await h.get('/api/leads/catalog', head)).body.stages as {
      id: string;
      key: string;
      label: string;
      system: boolean;
    }[];

  it('liderança cria coluna no fim, renomeia e usa para lead', async () => {
    const res = await h.post('/api/admin/stages', { label: 'Reativação' }, head);
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^C_[0-9A-F]{8}$/);
    const stages = await catalog();
    expect(stages.at(-1)).toMatchObject({ key: res.body.key, label: 'Reativação', system: false });
    expect(stages[0]!.system).toBe(true);
    expect(
      (await h.patch(`/api/admin/stages/${res.body.id}`, { label: 'Reativar' }, head)).status,
    ).toBe(200);
    const lead = await h.post(
      '/api/leads',
      {
        name: 'Lead coluna nova',
        instagram: '@coluna.nova',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
        stageKey: res.body.key,
      },
      ale,
    );
    expect(lead.status).toBe(201);
    const [row] = await owner<{ key: string }[]>`
      select s.key from leads l join pipeline_stages s on s.id = l.stage_id where l.id = ${lead.body.id}`;
    expect(row!.key).toBe(res.body.key);
  });

  it('reordena com a lista completa; incompleta é recusada', async () => {
    const stages = await catalog();
    const ids = stages.map((s) => s.id);
    const reversed = [...ids].reverse();
    expect((await h.post('/api/admin/stages/order', { ids: reversed }, head)).status).toBe(200);
    expect((await catalog()).map((s) => s.id)).toEqual(reversed);
    const partial = await h.post('/api/admin/stages/order', { ids: ids.slice(1) }, head);
    expect(partial.status).toBe(400);
    expect(partial.body.message).toBe('Ordem incompleta');
  });

  it('exclusão: recusa coluna com lead e de sistema; vazia sai e não recebe mais leads', async () => {
    const col = (await h.post('/api/admin/stages', { label: 'Temporária' }, head)).body;
    const lead = await h.post(
      '/api/leads',
      {
        name: 'Na temporária',
        instagram: '@temp.col',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
        stageKey: col.key,
      },
      ale,
    );
    const busy = await h.del(`/api/admin/stages/${col.id}`, {}, head);
    expect(busy.status).toBe(409);
    expect(busy.body.message).toBe('Mova os leads desta coluna antes de excluir');
    const sondagem = (await catalog()).find((s) => s.key === 'SONDAGEM')!;
    const system = await h.del(`/api/admin/stages/${sondagem.id}`, {}, head);
    expect(system.status).toBe(409);
    expect(system.body.message).toBe('Esta coluna é usada pelo sistema e não pode ser excluída');
    // Lead apagado não prende a coluna: vai para a primeira etapa.
    await owner`update leads set deleted_at = now() where id = ${lead.body.id}`;
    expect((await h.del(`/api/admin/stages/${col.id}`, {}, head)).status).toBe(204);
    const [moved] = await owner<{ key: string }[]>`
      select s.key from leads l join pipeline_stages s on s.id = l.stage_id where l.id = ${lead.body.id}`;
    expect(moved!.key).toBe('SONDAGEM');
    const late = await h.post(
      '/api/leads',
      {
        name: 'Atrasado',
        instagram: '@late.col',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
        stageKey: col.key,
      },
      ale,
    );
    expect(late.status).toBe(400);
    expect(late.body.message).toBe('Etapa inexistente');
  });

  it('coluna que já teve venda não é excluída (venda é imutável)', async () => {
    const col = (await h.post('/api/admin/stages', { label: 'Com venda' }, head)).body;
    const lead = await h.post(
      '/api/leads',
      {
        name: 'Vendeu na coluna',
        instagram: '@venda.col',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
        stageKey: col.key,
      },
      ale,
    );
    const [p] = await owner<{ id: string; closer_id: string }[]>`
      select id, closer_id from products where code = 'NACAO_PROMO'`;
    await owner`insert into deals (lead_id, product_id, product_name, catalog_price_cents, closer_id, sdr_id, total_cents, method, request_key, created_by, previous_stage_id)
      values (${lead.body.id}, ${p!.id}, 'Nação', 250000, ${p!.closer_id}, ${ids.ale!}, 250000, 'PIX', gen_random_uuid(), ${ids.ale!}, ${col.id})`;
    await owner`update leads set stage_id = (select id from pipeline_stages where key = 'VENDA') where id = ${lead.body.id}`;
    const res = await h.del(`/api/admin/stages/${col.id}`, {}, head);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Esta coluna tem venda registrada e não pode ser excluída');
    await owner`delete from payments where deal_id in (select id from deals where lead_id = ${lead.body.id})`;
    await owner`delete from deals where lead_id = ${lead.body.id}`;
  });

  it('SDR não mexe nas colunas', async () => {
    const id = (await catalog())[0]!.id;
    expect((await h.post('/api/admin/stages', { label: 'X' }, ale)).status).toBe(403);
    expect((await h.post('/api/admin/stages/order', { ids: [id] }, ale)).status).toBe(403);
    expect((await h.del(`/api/admin/stages/${id}`, {}, ale)).status).toBe(403);
  });
});
