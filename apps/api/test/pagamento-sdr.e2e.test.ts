import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// Item 13 do Igor (10/11/2026, "2A", "3A"): em Agendou Pagamento o SDR informa só produto, closer e
// se já pagou uma entrada; valor, entrada e data ficam com closer e liderança. O closer completa na
// ficha. R$ nunca chega ao SDR.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
type Who = 'ale' | 'murilo' | 'ronaldo' | 'sonia';
let ids: Record<Who, string>;
let ale: Cookie, sonia: Cookie, ronaldo: Cookie;
let productId: string;
let productCloser: string;

let seq = 0;
const lead = (over: Record<string, unknown> = {}) => ({
  name: 'Maria Pagamento',
  instagram: `@maria.pagamento.${++seq}`,
  incomeBand: 'R8_15K',
  source: 'BIO',
  ...over,
});
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const sdrPayment = (over: Record<string, unknown> = {}) => ({
  stageKey: 'AGENDOU_PAGAMENTO',
  paymentProductId: productId,
  paymentCloserId: ids.sonia,
  paymentEntryPaid: true,
  ...over,
});

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id])) as Record<Who, string>;
  const [p] = await owner<{ id: string; closer_id: string }[]>`
    select id, closer_id from products where closer_id = ${ids.sonia} limit 1`;
  productId = p!.id;
  productCloser = p!.closer_id;
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  ronaldo = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
});

async function create(body: object, cookie: Cookie = ale): Promise<string> {
  const res = await h.post('/api/leads', body, cookie);
  if (res.status !== 201) throw new Error(`criação falhou (${res.status}): ${res.text}`);
  return res.body.id;
}
const get = async (id: string, cookie: Cookie = ale) =>
  (await h.get(`/api/leads/${id}`, cookie)).body;
const row = async (id: string) => {
  const [r] = await owner<
    {
      closer_id: string | null;
      next_contact_at: Date | null;
      payment_product_id: string | null;
      payment_amount_cents: number | null;
      payment_entry_cents: number | null;
      payment_entry_paid: boolean;
    }[]
  >`select closer_id, next_contact_at, payment_product_id, payment_amount_cents,
      payment_entry_cents, payment_entry_paid from leads where id = ${id}`;
  return r!;
};
const timeline = (id: string) =>
  owner<{ kind: string; fields: string[] }[]>`
    select kind, fields from lead_timeline where lead_id = ${id} order by at, id`;
const notified = (id: string, kind: string) =>
  owner<{ user_id: string }[]>`
    select n.user_id from notifications n join lead_timeline t on t.id = n.timeline_id
    where t.lead_id = ${id} and t.kind = ${kind}`;
const complete = (id: string, over: Record<string, unknown> = {}, cookie: Cookie = sonia) =>
  h.patch(
    `/api/leads/${id}`,
    { version: 1, paymentAmountCents: 300_000, nextContactAt: inDays(4), ...over },
    cookie,
  );

describe('SDR em Agendou Pagamento', () => {
  it('cadastro grava só produto, closer e a marca; o next_contact_at fica nulo', async () => {
    const id = await create(lead(sdrPayment()));
    expect(await row(id)).toEqual({
      closer_id: ids.sonia,
      next_contact_at: null,
      payment_product_id: productId,
      payment_amount_cents: null,
      payment_entry_cents: null,
      payment_entry_paid: true,
    });
  });

  it('mover pela ficha limpa o próximo contato e avisa o closer', async () => {
    const id = await create(lead({ nextContactAt: inDays(1) }));
    const res = await h.patch(`/api/leads/${id}`, { version: 1, ...sdrPayment() }, ale);
    expect(res.status).toBe(200);
    expect(await row(id)).toMatchObject({
      closer_id: ids.sonia,
      next_contact_at: null,
      payment_entry_paid: true,
    });
    expect(await notified(id, 'payment.pending')).toEqual([{ user_id: ids.sonia }]);
    // Aparece como mudança de etapa, não como troca de responsável.
    // Mesma transação, mesmo instante: a ordem entre os dois não é garantida.
    expect((await timeline(id)).map((t) => t.kind).sort()).toEqual([
      'lead.created',
      'lead.moved',
      'payment.pending',
    ]);
  });

  it('sem produto ou sem closer → 409 PAYMENT_REQUIRED', async () => {
    const id = await create(lead());
    for (const miss of [{ paymentProductId: undefined }, { paymentCloserId: undefined }]) {
      const res = await h.patch(`/api/leads/${id}`, { version: 1, ...sdrPayment(miss) }, ale);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAYMENT_REQUIRED');
    }
    expect(
      (await h.post('/api/leads', lead(sdrPayment({ paymentCloserId: undefined })), ale)).body.code,
    ).toBe('PAYMENT_REQUIRED');
  });

  it('valor, entrada ou data vindos do SDR → 403 e nada gravado', async () => {
    const id = await create(lead());
    for (const extra of [
      { paymentAmountCents: 100_000 },
      { paymentEntryCents: 1_000 },
      { paymentEntryCents: null },
      { nextContactAt: inDays(5) },
      { nextContactAt: null },
    ]) {
      const res = await h.patch(`/api/leads/${id}`, { version: 1, ...sdrPayment(extra) }, ale);
      expect(res.status).toBe(403);
      // No cadastro, `nextContactAt: null` já para no formato (400).
      expect([400, 403]).toContain(
        (await h.post('/api/leads', lead(sdrPayment(extra)), ale)).status,
      );
    }
    expect((await row(id)).payment_product_id).toBeNull();
    expect(await owner`select id from leads`).toHaveLength(1);
  });

  it('closer precisa ser ativo e fechar venda', async () => {
    const id = await create(lead());
    const notCloser = await h.patch(
      `/api/leads/${id}`,
      { version: 1, ...sdrPayment({ paymentCloserId: ids.murilo }) },
      ale,
    );
    expect(notCloser.status).toBe(400);
    await owner`update "user" set active = false where id = ${ids.sonia}`;
    try {
      const inactive = await h.patch(`/api/leads/${id}`, { version: 1, ...sdrPayment() }, ale);
      expect(inactive.status).toBe(400);
    } finally {
      await owner`update "user" set active = true where id = ${ids.sonia}`;
    }
  });

  it('na etapa, enquanto não completou, o SDR troca produto e closer; o novo closer é avisado', async () => {
    const id = await create(lead(sdrPayment()));
    const [other] = await owner<{ id: string }[]>`
      select id from products where id <> ${productId} and active limit 1`;
    const res = await h.patch(
      `/api/leads/${id}`,
      {
        version: 1,
        paymentProductId: other!.id,
        paymentCloserId: ids.ronaldo,
        paymentEntryPaid: false,
      },
      ale,
    );
    expect(res.status).toBe(200);
    expect(await row(id)).toMatchObject({
      closer_id: ids.ronaldo,
      payment_product_id: other!.id,
      payment_entry_paid: false,
    });
    expect(await notified(id, 'payment.pending')).toContainEqual({ user_id: ids.ronaldo });
  });

  it('salvar sem trocar o closer não avisa de novo', async () => {
    const id = await create(lead(sdrPayment()));
    const res = await h.patch(
      `/api/leads/${id}`,
      {
        version: 1,
        paymentProductId: productId,
        paymentCloserId: ids.sonia,
        paymentEntryPaid: true,
        summary: 'segue',
      },
      ale,
    );
    expect(res.status).toBe(200);
    expect(await notified(id, 'payment.pending')).toHaveLength(1);
  });

  it('depois de completado, o SDR não troca produto nem closer, mas edita o resto', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id)).status).toBe(200);
    for (const change of [
      { paymentProductId: productId },
      { paymentCloserId: ids.ronaldo },
      { paymentEntryPaid: false },
    ]) {
      expect((await h.patch(`/api/leads/${id}`, { version: 2, ...change }, ale)).status).toBe(403);
    }
    expect((await h.patch(`/api/leads/${id}`, { version: 2, summary: 'ok' }, ale)).status).toBe(
      200,
    );
    expect((await row(id)).payment_amount_cents).toBe(300_000);
  });

  it('closer escolhido fora da etapa continua proibido ao SDR', async () => {
    const id = await create(lead());
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, paymentCloserId: ids.sonia }, ale)).status,
    ).toBe(403);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, closerId: ids.sonia }, ale)).status,
    ).toBe(403);
  });

  it('ação rápida do SDR não mexe na data do pagamento', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id)).status).toBe(200);
    const before = (await row(id)).next_contact_at;
    for (const body of [
      { version: 2, action: 'CALLED' },
      { version: 2, action: 'RESCHEDULED', at: inDays(9) },
      { version: 2, action: 'NEXT_ACTION', at: inDays(9), title: 'Ligar' },
    ]) {
      expect((await h.post(`/api/leads/${id}/quick-action`, body, ale)).status).toBe(403);
    }
    expect((await row(id)).next_contact_at).toEqual(before);
  });

  it('o Hoje do SDR não lista o pagamento combinado; o do closer lista', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id, { nextContactAt: inDays(-1) })).status).toBe(200);
    const of = async (c: Cookie) =>
      (await h.post('/api/today/search', {}, c)).body.overdue.map((l: { id: string }) => l.id);
    expect(await of(ale)).not.toContain(id);
    expect(await of(sonia)).toContain(id);
  });
});

describe('corte de R$ para o SDR', () => {
  it('lead do SDR não traz valor nem entrada, nem depois de completado', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id, { paymentEntryCents: 100_000 })).status).toBe(200);
    const mine = await get(id);
    expect(mine).toMatchObject({
      paymentProductId: productId,
      paymentEntryPaid: true,
      paymentAmountCents: null,
      paymentEntryCents: null,
      paymentToComplete: false,
    });
    const page = await h.post('/api/leads/search', { page: 1, pageSize: 30 }, ale);
    expect(JSON.stringify(page.body)).not.toContain('300000');
    expect(JSON.stringify(page.body)).not.toContain('100000');
    expect(await get(id, sonia)).toMatchObject({
      paymentAmountCents: 300_000,
      paymentEntryCents: 100_000,
    });
  });

  it('a data combinada também não chega ao SDR', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id)).status).toBe(200);
    expect((await get(id)).nextContactAt).toBeNull();
    expect((await get(id, sonia)).nextContactAt).not.toBeNull();
    const columns = (await h.post('/api/leads/pipeline/search', {}, ale)).body as {
      stage: { key: string };
      items: { id: string; nextContactAt: string | null }[];
    }[];
    const col = columns.find((c) => c.stage.key === 'AGENDOU_PAGAMENTO')!;
    expect(col.items.find((l) => l.id === id)?.nextContactAt).toBeNull();
  });

  it('o sino do SDR não conta o pagamento combinado como atrasado', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id, { nextContactAt: inDays(-3) })).status).toBe(200);
    expect((await h.get('/api/notifications', ale)).body.overdue).toBe(0);
  });

  it('produtos sem preço para o SDR, com preço para closer e liderança', async () => {
    const sdr = await h.get('/api/finance/products', ale);
    expect(sdr.status).toBe(200);
    expect(sdr.body.length).toBeGreaterThan(0);
    for (const p of sdr.body) expect(p).not.toHaveProperty('priceCents');
    for (const c of [sonia, ronaldo]) {
      const { body } = await h.get('/api/finance/products', c);
      expect(body[0].priceCents).toBeGreaterThan(0);
    }
  });

  it('o catálogo do lead não traz R$', async () => {
    const { body } = await h.get('/api/leads/catalog', ale);
    expect(JSON.stringify(body)).not.toMatch(/price|cents/i);
  });
});

describe('closer completa o pagamento', () => {
  it('sem reunião, enxerga o lead, vê o selo e completa', async () => {
    const id = await create(lead(sdrPayment()));
    expect(await get(id, sonia)).toMatchObject({
      paymentToComplete: true,
      paymentEntryPaid: true,
      closer: { id: ids.sonia },
    });
    const res = await complete(id, { paymentEntryCents: 100_000 });
    expect(res.status).toBe(200);
    expect(await get(id, sonia)).toMatchObject({
      paymentToComplete: false,
      paymentAmountCents: 300_000,
      paymentEntryCents: 100_000,
      paymentEntryPaid: true,
    });
    const last = (await timeline(id)).at(-1)!;
    expect(last.kind).toBe('lead.updated');
    expect(last.fields).toEqual(expect.arrayContaining(['payment', 'nextContactAt']));
    expect(JSON.stringify(last)).not.toContain('300000');
  });

  it('o selo aparece no Pipeline', async () => {
    const id = await create(lead(sdrPayment()));
    const columns = (await h.post('/api/leads/pipeline/search', {}, sonia)).body as {
      stage: { key: string };
      items: { id: string; paymentToComplete: boolean }[];
    }[];
    const col = columns.find((c) => c.stage.key === 'AGENDOU_PAGAMENTO')!;
    expect(col.items.find((l) => l.id === id)?.paymentToComplete).toBe(true);
  });

  it('desmarcar a entrada ao completar apaga a marca', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id, { paymentEntryCents: null })).status).toBe(200);
    expect(await row(id)).toMatchObject({ payment_entry_paid: false, payment_entry_cents: null });
  });

  it('sem valor ou sem data → 409 PAYMENT_REQUIRED', async () => {
    const id = await create(lead(sdrPayment()));
    for (const miss of [
      { paymentAmountCents: undefined },
      { nextContactAt: undefined },
      { nextContactAt: null },
    ]) {
      const res = await complete(id, miss);
      expect([403, 409]).toContain(res.status);
    }
    const noDate = await complete(id, { nextContactAt: undefined });
    expect(noDate.status).toBe(409);
    expect(noDate.body.code).toBe('PAYMENT_REQUIRED');
  });

  it('entrada igual ou maior que o valor → 400', async () => {
    const id = await create(lead(sdrPayment()));
    const res = await complete(id, { paymentEntryCents: 300_000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/entrada/i);
  });

  it('outro closer não enxerga; depois de completado o closer não edita', async () => {
    const id = await create(lead(sdrPayment({ paymentCloserId: ids.ronaldo })));
    expect((await h.get(`/api/leads/${id}`, sonia)).status).toBe(404);

    const mine = await create(lead(sdrPayment()));
    expect((await complete(mine)).status).toBe(200);
    expect((await complete(mine, { version: 2, paymentAmountCents: 1 })).status).toBe(403);
  });

  it('closer não troca produto nem outros campos ao completar', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id, { paymentProductId: productId })).status).toBe(403);
    expect((await complete(id, { summary: 'x' })).status).toBe(403);
  });

  it('closer de outra reunião vê o lead, mas não completa', async () => {
    const id = await create(lead(sdrPayment({ paymentCloserId: ids.ronaldo })));
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${id}, ${ids.sonia}, now() - interval '1 hour', 'DIRETO', ${ids.ale})`;
    expect((await h.get(`/api/leads/${id}`, sonia)).status).toBe(200);
    expect((await complete(id)).status).toBe(403);
  });

  it('liderança completa pelos mesmos campos', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id, {}, ronaldo)).status).toBe(200);
    expect((await row(id)).payment_amount_cents).toBe(300_000);
  });

  it('liderança edita outro campo sem apagar o que o SDR informou', async () => {
    const id = await create(lead(sdrPayment()));
    const res = await h.patch(`/api/leads/${id}`, { version: 1, summary: 'anotado' }, ronaldo);
    expect(res.status).toBe(200);
    expect(await row(id)).toMatchObject({
      payment_product_id: productId,
      payment_entry_paid: true,
      payment_amount_cents: null,
    });
  });

  it('closer sem reunião registra a venda, segue vendo o lead e tudo é apagado', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id, { paymentEntryCents: 100_000 })).status).toBe(200);
    const reg = await h.post(
      '/api/finance/deals',
      {
        leadId: id,
        productId,
        closerId: productCloser,
        version: 2,
        totalCents: 300_000,
        method: 'PARTIAL',
        entryCents: 100_000,
        installments: [{ amountCents: 200_000, dueAt: inDays(4) }],
        requestKey: randomUUID(),
      },
      sonia,
    );
    expect(reg.status).toBe(201);
    expect(await get(id, sonia)).toMatchObject({
      stageKey: 'VENDA',
      paymentProductId: null,
      paymentAmountCents: null,
      paymentEntryCents: null,
      paymentEntryPaid: false,
      paymentToComplete: false,
      nextContactAt: null,
    });
  });

  it('closer sem reunião tira o lead da etapa: fica gravado na timeline', async () => {
    const id = await create(lead(sdrPayment()));
    const res = await h.patch(
      `/api/leads/${id}`,
      { version: 1, stageKey: 'PERDIDO', lostReason: 'SEM_INTERESSE' },
      sonia,
    );
    expect(res.status).toBe(200);
    expect((await timeline(id)).map((t) => t.kind)).toContain('lead.moved');
    expect(await row(id)).toMatchObject({ payment_product_id: null, payment_entry_paid: false });
    expect((await h.get(`/api/leads/${id}`, sonia)).status).toBe(404);
  });

  it('sair da etapa apaga tudo, inclusive a marca e a data combinada', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id)).status).toBe(200);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 2, stageKey: 'EM_FOLLOW' }, ale)).status,
    ).toBe(200);
    expect(await row(id)).toMatchObject({
      next_contact_at: null,
      payment_product_id: null,
      payment_amount_cents: null,
      payment_entry_cents: null,
      payment_entry_paid: false,
    });
  });

  it('ao sair, o próximo contato informado na troca vale', async () => {
    const id = await create(lead(sdrPayment()));
    expect((await complete(id)).status).toBe(200);
    const at = inDays(2);
    expect(
      (
        await h.patch(
          `/api/leads/${id}`,
          { version: 2, stageKey: 'EM_FOLLOW', nextContactAt: at },
          ale,
        )
      ).status,
    ).toBe(200);
    expect((await row(id)).next_contact_at?.toISOString()).toBe(at);
  });

  it('lead antigo na etapa sem produto não vira pagamento a completar', async () => {
    const id = await create(lead());
    await owner`update leads set stage_id = (select id from pipeline_stages where key = 'AGENDOU_PAGAMENTO') where id = ${id}`;
    expect((await get(id)).paymentToComplete).toBe(false);
  });
});

describe('closer e liderança seguem com todos os campos', () => {
  it('liderança marca a entrada pelo valor e a API deriva a marca', async () => {
    const id = await create(
      lead({
        sdrId: ids.ale,
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(5),
        paymentProductId: productId,
        paymentAmountCents: 300_000,
        paymentEntryCents: 100_000,
      }),
      ronaldo,
    );
    expect(await row(id)).toMatchObject({
      payment_amount_cents: 300_000,
      payment_entry_cents: 100_000,
      payment_entry_paid: true,
    });
  });

  it('liderança ainda precisa de data, produto e valor ao mover', async () => {
    const id = await create(lead({ sdrId: ids.ale }), ronaldo);
    const res = await h.patch(
      `/api/leads/${id}`,
      { version: 1, stageKey: 'AGENDOU_PAGAMENTO', paymentProductId: productId },
      ronaldo,
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PAYMENT_REQUIRED');
  });

  it('paymentCloserId é só do SDR', async () => {
    const id = await create(lead({ sdrId: ids.ale }), ronaldo);
    const res = await h.patch(
      `/api/leads/${id}`,
      {
        version: 1,
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(5),
        paymentProductId: productId,
        paymentAmountCents: 300_000,
        paymentCloserId: ids.sonia,
      },
      ronaldo,
    );
    expect(res.status).toBe(400);
  });
});
