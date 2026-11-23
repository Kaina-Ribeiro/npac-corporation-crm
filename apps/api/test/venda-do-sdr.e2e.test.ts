import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SinoPush } from '../src/push/sino-push.js';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// NPAC-48 (Igor, 17/11/2026): depois da reunião realizada, o SDR marca a venda escolhendo só o
// produto; o lead vai para Venda como "venda a registrar" e o closer da reunião põe o valor. Cada
// venda marcada dá ao SDR a renda extra do produto (catálogo), contada na data da marcação (1A) e
// mostrada só no painel do SDR (5B). Sai no estorno ou se o lead deixar a Venda sem venda.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
type Who = 'ale' | 'murilo' | 'ronaldo' | 'sonia' | 'diretor';
let ids: Record<Who, string>;
let ale: Cookie, murilo: Cookie, sonia: Cookie, ronaldo: Cookie;
let padrao: string, promo: string, rdv: string;

const DAY = 86_400_000;
const spDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const today = () => spDay(new Date());
let seq = 0;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id])) as Record<Who, string>;
  const ps = await owner<{ id: string; code: string }[]>`select id, code from products`;
  padrao = ps.find((p) => p.code === 'NACAO_PADRAO')!.id;
  promo = ps.find((p) => p.code === 'NACAO_PROMO')!.id;
  rdv = ps.find((p) => p.code === 'RDV')!.id;
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  // O aviso `sale.pending` do teste anterior vira push do sino em segundo plano (#109): esperar o
  // envio e, se ainda assim o truncate cruzar com ele (deadlock), tentar de novo.
  for (let i = 0; ; i++) {
    await app.get(SinoPush).settled();
    try {
      await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, sdr_sale_marks, leads`;
      break;
    } catch (e) {
      if ((e as { code?: string }).code !== '40P01' || i >= 2) throw e;
    }
  }
  // Valores do Igor no catálogo (a migration e o seed já trazem; outro teste pode ter mudado).
  await owner`update products set sdr_bonus_cents = case code when 'NACAO_PROMO' then 500 when 'NACAO_PADRAO' then 1000
    when 'NACAO_COMPLETO' then 2000 when 'RDV' then 7000 when 'MENTORIA_2M' then 9000 when 'MENTORIA_6M' then 12000 else 0 end`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  ronaldo = await h.signIn('ronaldo@npac.com.br');
});

/** Lead do SDR com reunião da Sônia (ou outro closer), já com o resultado informado. */
async function leadWithMeeting(
  outcome: 'DONE' | 'NO_SHOW' | null = 'DONE',
  closer: Who = 'sonia',
  cookie: Cookie = ale,
) {
  const res = await h.post(
    '/api/leads',
    {
      name: `Lead Venda SDR ${++seq}`,
      instagram: `@venda.sdr.${seq}`,
      incomeBand: 'R8_15K',
      source: 'BIO',
      stageKey: 'EM_FOLLOW',
    },
    cookie,
  );
  expect(res.status, res.text).toBe(201);
  const id: string = res.body.id;
  const sdr = cookie === murilo ? ids.murilo : ids.ale;
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, outcome, outcome_at, created_by)
    values (${id}, ${ids[closer]}, now() - interval '2 hours', 'FOLLOW', ${outcome},
      case when ${outcome}::text is null then null else now() - interval '1 hour' end, ${sdr})`;
  return id;
}
const version = async (id: string, cookie: Cookie = ale) =>
  (await h.get(`/api/leads/${id}`, cookie)).body.version as number;
const mark = async (id: string, productId = padrao, cookie: Cookie = ale) =>
  h.post(`/api/leads/${id}/sale-mark`, { version: await version(id, cookie), productId }, cookie);
const dashboard = (cookie: Cookie = ale) =>
  h.post('/api/reports/search', { period: 'RANGE', from: today(), to: today() }, cookie);
const marks = (id: string) =>
  owner<
    {
      sdr_id: string;
      product_id: string;
      bonus_cents: number;
      marked_by: string;
      canceled_at: Date | null;
    }[]
  >`select sdr_id, product_id, bonus_cents, marked_by, canceled_at from sdr_sale_marks where lead_id = ${id} order by marked_at`;
/** Venda que o closer registra pondo o valor (Nação Padrão à vista). */
const register = async (id: string, productId = padrao, cookie: Cookie = sonia) =>
  h.post(
    '/api/finance/deals',
    {
      leadId: id,
      productId,
      closerId: ids.sonia,
      version: await version(id, cookie),
      totalCents: 300_000,
      method: 'PIX',
      entryCents: 0,
      installments: [],
      requestKey: randomUUID(),
    },
    cookie,
  );

describe('SDR marca a venda depois da reunião realizada', () => {
  it('lead vai para Venda a registrar, closer da reunião vira o do lead e é avisado', async () => {
    const id = await leadWithMeeting();
    const res = await mark(id);
    expect(res.status, res.text).toBe(201);

    const got = (await h.get(`/api/leads/${id}`, ale)).body;
    expect(got).toMatchObject({
      stageKey: 'VENDA',
      saleToRegister: true,
      soldProductId: padrao,
      closer: { id: ids.sonia },
    });
    // O closer da reunião recebe o pedido de registro (sino e, pelo B2, push).
    const [n] = await owner<{ user_id: string; kind: string }[]>`
      select n.user_id, t.kind from notifications n join lead_timeline t on t.id = n.timeline_id
      where t.lead_id = ${id} and t.kind = 'sale.pending'`;
    expect(n).toMatchObject({ user_id: ids.sonia, kind: 'sale.pending' });
    // Renda extra do SDR com o valor do catálogo de hoje.
    expect(await marks(id)).toMatchObject([
      {
        sdr_id: ids.ale,
        product_id: padrao,
        bonus_cents: 1000,
        marked_by: ids.ale,
        canceled_at: null,
      },
    ]);
    // O closer enxerga o lead a registrar e o produto, para pôr o valor.
    const forCloser = (await h.get(`/api/leads/${id}`, sonia)).body;
    expect(forCloser).toMatchObject({ saleToRegister: true, soldProductId: padrao });
  });

  it('sem reunião realizada (nenhuma, aberta ou no-show) → 409 e nada muda', async () => {
    for (const outcome of [null, 'NO_SHOW'] as const) {
      const id = await leadWithMeeting(outcome);
      const res = await mark(id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('MEETING_DONE_REQUIRED');
      expect((await h.get(`/api/leads/${id}`, ale)).body.stageKey).toBe('EM_FOLLOW');
      expect(await marks(id)).toHaveLength(0);
    }
  });

  it('produto de outro closer → 400; closer não marca (403); já em Venda → 409', async () => {
    const id = await leadWithMeeting();
    // RDV é do Ronaldo; a reunião foi com a Sônia.
    expect((await mark(id, rdv)).status).toBe(400);
    expect((await mark(id, padrao, sonia)).status).toBe(403);
    expect((await mark(id)).status).toBe(201);
    const again = await mark(id, promo);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_SOLD');
    expect(await marks(id)).toHaveLength(1);
  });

  it('versão antiga → 409 VERSION_CONFLICT; lead de outro SDR → 404', async () => {
    const id = await leadWithMeeting();
    const v = await version(id);
    await h.patch(`/api/leads/${id}`, { version: v, summary: 'mudou' }, ale);
    const stale = await h.post(
      `/api/leads/${id}/sale-mark`,
      { version: v, productId: padrao },
      ale,
    );
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    const other = await h.post(
      `/api/leads/${id}/sale-mark`,
      { version: v + 1, productId: padrao },
      murilo,
    );
    expect(other.status).toBe(404);
  });

  it('a liderança marca pelo SDR: a renda vai para o SDR do lead', async () => {
    const id = await leadWithMeeting();
    expect((await mark(id, promo, ronaldo)).status).toBe(201);
    expect(await marks(id)).toMatchObject([
      { sdr_id: ids.ale, bonus_cents: 500, marked_by: ids.ronaldo },
    ]);
    // O SDR também é avisado quando não foi ele que marcou.
    const users = await owner<{ user_id: string }[]>`
      select n.user_id from notifications n join lead_timeline t on t.id = n.timeline_id
      where t.lead_id = ${id} and t.kind = 'sale.pending' order by n.user_id`;
    expect(users.map((u) => u.user_id).sort()).toEqual([ids.ale, ids.sonia].sort());
  });
});

describe('closer completa o valor e a renda aparece no painel do SDR', () => {
  it('closer registra a venda com o valor: lead segue em Venda, renda continua', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    const res = await register(id);
    expect(res.status, res.text).toBe(201);
    const got = (await h.get(`/api/leads/${id}`, sonia)).body;
    expect(got).toMatchObject({ stageKey: 'VENDA', saleToRegister: false, soldProductId: null });
    expect((await marks(id))[0]!.canceled_at).toBeNull();
  });

  it('Dashboard do SDR soma a renda por produto; a de outro SDR não entra', async () => {
    await mark(await leadWithMeeting());
    await mark(await leadWithMeeting());
    await mark(await leadWithMeeting(), promo);
    await mark(await leadWithMeeting('DONE', 'sonia', murilo), padrao, murilo);
    const res = await dashboard();
    expect(res.status).toBe(200);
    expect(res.body.saleBonus).toEqual({
      cents: 2500,
      count: 3,
      byProduct: [
        { id: padrao, name: 'Nação Padrão', count: 2, cents: 2000 },
        { id: promo, name: 'Nação Promocional', count: 1, cents: 500 },
      ],
      // Por dia de Brasília: o balão preto acumula a linha (Igor, 17/11/2026).
      daily: [{ date: today(), cents: 2500 }],
    });
    expect((await dashboard(murilo)).body.saleBonus.cents).toBe(1000);
  });

  it('conta na data da marcação (1A): marcação de ontem fica fora do período de hoje', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    await owner`update sdr_sale_marks set marked_at = now() - interval '1 day' where lead_id = ${id}`;
    expect((await dashboard()).body.saleBonus).toEqual({
      cents: 0,
      count: 0,
      byProduct: [],
      daily: [],
    });
    const yesterday = spDay(new Date(Date.now() - DAY));
    const res = await h.post(
      '/api/reports/search',
      { period: 'RANGE', from: yesterday, to: yesterday },
      ale,
    );
    expect(res.body.saleBonus).toMatchObject({
      cents: 1000,
      daily: [{ date: yesterday, cents: 1000 }],
    });
  });

  it('valor guardado na marcação: mudar o catálogo depois não muda a renda já ganha', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    const res = await h.patch(`/api/admin/products/${padrao}`, { sdrBonusCents: 1500 }, ronaldo);
    expect(res.status, res.text).toBe(200);
    expect((await dashboard()).body.saleBonus.cents).toBe(1000);
    await mark(await leadWithMeeting());
    expect((await dashboard()).body.saleBonus.cents).toBe(2500);
  });

  it('SDR não vê R$ da venda: nem no painel, nem na ficha, nem no catálogo', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    await register(id);
    const board = await dashboard();
    for (const field of ['soldCents', 'receivedCents', 'outstandingCents', 'ticketCents'])
      expect(board.text).not.toContain(field);
    const lead = (await h.get(`/api/leads/${id}`, ale)).body;
    expect(lead.paymentAmountCents).toBeNull();
    expect(JSON.stringify(lead)).not.toContain('300000');
    const products = (await h.get('/api/finance/products', ale)).body as object[];
    expect(products.every((p) => !('priceCents' in p) && !('sdrBonusCents' in p))).toBe(true);
    expect((await h.get(`/api/finance/leads/${id}`, ale)).status).not.toBe(200);
  });

  it('cada SDR vê a sua; a liderança vê a de todos, por SDR e com o filtro; closer não recebe', async () => {
    await mark(await leadWithMeeting());
    await mark(await leadWithMeeting(), promo);
    await mark(await leadWithMeeting('DONE', 'sonia', murilo), padrao, murilo);
    const head = await dashboard(ronaldo);
    expect(head.body.saleBonus).toEqual({
      cents: 2500,
      count: 3,
      byProduct: [
        { id: padrao, name: 'Nação Padrão', count: 2, cents: 2000 },
        { id: promo, name: 'Nação Promocional', count: 1, cents: 500 },
      ],
      bySdr: [
        { id: ids.ale, name: 'Ale', count: 2, cents: 1500 },
        { id: ids.murilo, name: 'Murilo', count: 1, cents: 1000 },
      ],
      daily: [{ date: today(), cents: 2500 }],
    });
    const onlyMurilo = await h.post(
      '/api/reports/search',
      { period: 'RANGE', from: today(), to: today(), sdrId: ids.murilo },
      ronaldo,
    );
    expect(onlyMurilo.body.saleBonus).toMatchObject({
      cents: 1000,
      bySdr: [{ id: ids.murilo, cents: 1000 }],
    });
    const diretor = await h.signIn('diretor@npac.com.br');
    expect((await dashboard(diretor)).body.saleBonus.cents).toBe(2500);
    // O SDR só vê a dele, sem a linha por SDR.
    expect((await dashboard()).body.saleBonus).toEqual({
      cents: 1500,
      count: 2,
      byProduct: [
        { id: padrao, name: 'Nação Padrão', count: 1, cents: 1000 },
        { id: promo, name: 'Nação Promocional', count: 1, cents: 500 },
      ],
      daily: [{ date: today(), cents: 1500 }],
    });
    expect('saleBonus' in (await dashboard(sonia)).body).toBe(false);
  });
});

describe('a renda sai quando a venda não se confirma', () => {
  it('estorno tira a renda e o lead volta para Em follow', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    const sale = await register(id);
    const reversed = await h.post(
      `/api/finance/deals/${sale.body.id}/reverse`,
      { version: 1 },
      ronaldo,
    );
    expect(reversed.status, reversed.text).toBe(200);
    expect((await marks(id))[0]!.canceled_at).not.toBeNull();
    expect((await h.get(`/api/leads/${id}`, ale)).body.stageKey).toBe('EM_FOLLOW');
    expect((await dashboard()).body.saleBonus).toEqual({
      cents: 0,
      count: 0,
      byProduct: [],
      daily: [],
    });
  });

  it('lead sai de Venda sem venda registrada → renda sai; marcar de novo conta outra vez', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    const moved = await h.patch(
      `/api/leads/${id}`,
      { version: await version(id), stageKey: 'EM_FOLLOW' },
      ale,
    );
    expect(moved.status, moved.text).toBe(200);
    expect((await h.get(`/api/leads/${id}`, ale)).body.soldProductId).toBeNull();
    expect((await dashboard()).body.saleBonus.cents).toBe(0);
    expect((await mark(id, promo)).status).toBe(201);
    const rows = await marks(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.canceled_at).not.toBeNull();
    expect(rows[1]).toMatchObject({ bonus_cents: 500, canceled_at: null });
    expect((await dashboard()).body.saleBonus.cents).toBe(500);
  });

  it('lead excluído pela liderança tira a renda', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    const del = await h.del(`/api/leads/${id}`, { version: await version(id, ronaldo) }, ronaldo);
    expect(del.status, del.text).toBe(200);
    expect((await marks(id))[0]!.canceled_at).not.toBeNull();
  });

  it('banco: npac_app não altera nem apaga a marcação direto', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    const grants = await owner<{ privilege_type: string }[]>`
      select privilege_type from information_schema.role_table_grants
      where table_name = 'sdr_sale_marks' and grantee = 'npac_app' order by privilege_type`;
    expect(grants.map((g) => g.privilege_type)).toEqual(['INSERT', 'SELECT']);
  });
});

describe('cadastro em Venda Fechada também é o SDR marcando a venda', () => {
  it('sem a venda (produto do closer da reunião) → renda extra do SDR', async () => {
    const res = await h.post(
      '/api/leads',
      {
        name: 'Fechada no cadastro',
        instagram: '@fechada.cadastro',
        incomeBand: 'R8_15K',
        source: 'BIO',
        stageKey: 'VENDA',
        soldProductId: padrao,
        meeting: { scheduledAt: new Date(Date.now() - DAY).toISOString(), closerId: ids.sonia },
      },
      ale,
    );
    expect(res.status, res.text).toBe(201);
    expect(await marks(res.body.id)).toMatchObject([{ sdr_id: ids.ale, bonus_cents: 1000 }]);
  });
});

describe('catálogo: renda extra por produto (Admin)', () => {
  it('liderança lê e edita; SDR não acessa o Admin', async () => {
    const list = (await h.get('/api/admin/products', ronaldo)).body as {
      code: string;
      sdrBonusCents: number;
    }[];
    expect(Object.fromEntries(list.map((p) => [p.code, p.sdrBonusCents]))).toMatchObject({
      NACAO_PROMO: 500,
      NACAO_PADRAO: 1000,
      NACAO_COMPLETO: 2000,
      RDV: 7000,
      MENTORIA_2M: 9000,
      MENTORIA_6M: 12000,
    });
    expect(
      (await h.patch(`/api/admin/products/${promo}`, { sdrBonusCents: -1 }, ronaldo)).status,
    ).toBe(400);
    expect(
      (await h.patch(`/api/admin/products/${promo}`, { sdrBonusCents: 600 }, ale)).status,
    ).toBe(403);
  });
});

// NPAC-51 (Igor, 18/11/2026, "1A"): para o SDR, "Vendas" conta assim que ele marca a venda, na data
// da marcação, sem esperar o closer pôr o valor. Uma por lead; a liderança e o closer seguem contando
// só a venda registrada.
describe('para o SDR a venda conta ao marcar (1A)', () => {
  const row = (rows: { id: string; sales: number }[], id: string) => rows.find((r) => r.id === id);

  it('venda marcada, ainda a registrar, já conta em Vendas do SDR e na linha do closer da reunião', async () => {
    const id = await leadWithMeeting();
    await mark(id, promo);
    const sdr = (await dashboard()).body;
    expect(sdr.metrics.sales).toBe(1);
    expect(row(sdr.bySdr, ids.ale)?.sales).toBe(1);
    expect(row(sdr.byCloser, ids.sonia)?.sales).toBe(1);
    // Liderança e closer: só a venda registrada com valor.
    expect((await dashboard(ronaldo)).body.metrics.sales).toBe(0);
    expect((await dashboard(sonia)).body.metrics.sales).toBe(0);
  });

  it('o closer registra depois: continua uma venda, não duas', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    expect((await register(id)).status).toBe(201);
    const sdr = (await dashboard()).body;
    expect(sdr.metrics.sales).toBe(1);
    expect(row(sdr.bySdr, ids.ale)?.sales).toBe(1);
    expect(row(sdr.byCloser, ids.sonia)?.sales).toBe(1);
    expect((await dashboard(ronaldo)).body.metrics.sales).toBe(1);
  });

  it('marcada ontem e registrada hoje: conta ontem (data da marcação), não hoje', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    await owner`update sdr_sale_marks set marked_at = now() - interval '1 day' where lead_id = ${id}`;
    await register(id);
    expect((await dashboard()).body.metrics.sales).toBe(0);
    const yesterday = spDay(new Date(Date.now() - DAY));
    const res = await h.post(
      '/api/reports/search',
      { period: 'RANGE', from: yesterday, to: yesterday },
      ale,
    );
    expect(res.body.metrics.sales).toBe(1);
    // Sem reunião nem lead novo ontem, a linha do SDR e a do closer aparecem só pela venda.
    expect(row(res.body.bySdr, ids.ale)?.sales).toBe(1);
    expect(row(res.body.byCloser, ids.sonia)?.sales).toBe(1);
  });

  it('venda que o closer registra sem marcação segue contando para o SDR do lead', async () => {
    const id = await leadWithMeeting();
    expect((await register(id)).status).toBe(201);
    const sdr = (await dashboard()).body;
    expect(sdr.metrics.sales).toBe(1);
    expect(sdr.saleBonus.count).toBe(0);
  });

  it('lead sai da Venda: deixa de contar', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    const res = await h.patch(
      `/api/leads/${id}`,
      { version: await version(id), stageKey: 'EM_FOLLOW' },
      ale,
    );
    expect(res.status, res.text).toBe(200);
    const sdr = (await dashboard()).body;
    expect(sdr.metrics.sales).toBe(0);
    expect(row(sdr.bySdr, ids.ale)?.sales).toBe(0);
  });

  it('resumo copiado e CSV do período do SDR trazem as vendas e o valor por venda feita, sem R$ da venda', async () => {
    await mark(await leadWithMeeting(), promo);
    const summary = await h.post('/api/reports/summary', { period: 'TODAY' }, ale);
    expect(summary.body.text).toContain('Vendas: 1');
    expect(summary.body.text).toMatch(/Valor a receber por venda feita: R\$\s5,00/);
    expect(summary.body.text).not.toContain('Vendido');
    const csv = await h.post('/api/reports/export', { period: 'TODAY' }, ale);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('"Vendas";"1"');
    expect(csv.text).toContain('"Valor por vendas feitas (R$)";"5,00"');
    expect(csv.text).not.toContain('Vendido');
  });
});

// NPAC-51 (Gabriel, 18/11/2026): a venda marcada pelo SDR fica parada até o closer pôr o valor, e ele
// só tinha o aviso do sino. O Hoje de quem registra venda lista as vendas a registrar.
describe('Hoje de quem registra a venda lista as vendas a registrar', () => {
  const hoje = async (cookie: Cookie) =>
    (await h.post('/api/today/search', {}, cookie)).body.salesToRegister as {
      id: string;
      name: string;
      product: string | null;
      closer: { id: string; name: string } | null;
    }[];

  it('closer da venda e liderança veem o lead com o produto; SDR e outro closer não', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    const name = (await h.get(`/api/leads/${id}`, ale)).body.name as string;
    const item = { id, name, product: 'Nação Padrão', closer: { id: ids.sonia, name: 'Sônia' } };
    expect(await hoje(sonia)).toEqual([item]);
    expect(await hoje(ronaldo)).toEqual([item]);
    expect(await hoje(ale)).toEqual([]);
    // Liderança filtrando por outro closer: a venda é da Sônia.
    const other = await h.post('/api/today/search', { closerId: ids.ronaldo }, ronaldo);
    expect(other.body.salesToRegister).toEqual([]);
  });

  it('sai da lista quando a venda é registrada ou o lead deixa a Venda', async () => {
    const sold = await leadWithMeeting();
    await mark(sold);
    const left = await leadWithMeeting();
    await mark(left);
    expect((await hoje(sonia)).map((s) => s.id).sort()).toEqual([sold, left].sort());
    expect((await register(sold)).status).toBe(201);
    await h.patch(
      `/api/leads/${left}`,
      { version: await version(left), stageKey: 'EM_FOLLOW' },
      ale,
    );
    expect(await hoje(sonia)).toEqual([]);
  });
});

// NPAC-59 (Igor, 23/11/2026, "A"): o SDR que pôs o lead em Agendou Pagamento com o produto já fez a
// venda dele. Quando o closer (ou a liderança) registra a venda, o SDR ganha a renda extra do produto
// que ele informou, ligada à reunião realizada mais recente, sem precisar de "Marcar venda".
describe('venda que vem do Agendou Pagamento dá a renda extra ao SDR', () => {
  /** SDR põe o lead (com reunião realizada) em Agendou Pagamento, com produto e entrada paga. */
  const schedulePayment = async (id: string, productId = padrao) => {
    const res = await h.patch(
      `/api/leads/${id}`,
      {
        version: await version(id),
        stageKey: 'AGENDOU_PAGAMENTO',
        paymentProductId: productId,
        paymentCloserId: ids.sonia,
        paymentEntryPaid: true,
      },
      ale,
    );
    expect(res.status, res.text).toBe(200);
  };

  it('closer registra: renda do produto do SDR, na data do registro', async () => {
    const id = await leadWithMeeting();
    await schedulePayment(id);
    expect((await register(id)).status).toBe(201);
    expect(await marks(id)).toMatchObject([
      {
        sdr_id: ids.ale,
        product_id: padrao,
        bonus_cents: 1000,
        marked_by: ids.sonia,
        canceled_at: null,
      },
    ]);
    const sdr = (await dashboard()).body;
    expect(sdr.saleBonus).toMatchObject({ count: 1, cents: 1000 });
    expect(sdr.metrics.sales).toBe(1);
  });

  it('liderança registra (caso do Igor com o acesso do Ronaldo): o SDR ganha igual', async () => {
    const id = await leadWithMeeting();
    await schedulePayment(id);
    expect((await register(id, padrao, ronaldo)).status).toBe(201);
    expect(await marks(id)).toMatchObject([
      { sdr_id: ids.ale, product_id: padrao, bonus_cents: 1000, marked_by: ids.ronaldo },
    ]);
  });

  it('closer registra outro produto: a renda segue o produto que o SDR informou', async () => {
    const id = await leadWithMeeting();
    await schedulePayment(id, promo);
    expect((await register(id, padrao)).status).toBe(201);
    expect(await marks(id)).toMatchObject([{ product_id: promo, bonus_cents: 500 }]);
  });

  it('estorno tira a renda', async () => {
    const id = await leadWithMeeting();
    await schedulePayment(id);
    const sale = await register(id);
    expect(sale.status).toBe(201);
    const [d] = await owner<
      { version: number }[]
    >`select version from deals where id = ${sale.body.id}`;
    const rev = await h.post(
      `/api/finance/deals/${sale.body.id}/reverse`,
      { version: d!.version },
      ronaldo,
    );
    expect(rev.status, rev.text).toBeLessThan(300);
    const after = await marks(id);
    expect(after).toHaveLength(1);
    expect(after[0]!.canceled_at).not.toBeNull();
    expect((await dashboard()).body.saleBonus.count).toBe(0);
  });

  it('registro direto, sem Agendou Pagamento, continua sem renda (2B de 17/11)', async () => {
    const id = await leadWithMeeting();
    expect((await register(id)).status).toBe(201);
    expect(await marks(id)).toEqual([]);
  });
});

// NPAC-68 (Igor, 23/11/2026): o cliente pagou e o lead está em Agendou Pagamento. O SDR do lead (ou
// a liderança) marca a venda sem depender do closer: o lead vai para Venda a registrar com o closer e
// o produto do pagamento, o closer é avisado para pôr o valor e o SDR ganha a renda extra. Continua
// pedindo a reunião realizada (NPAC-65 em aberto).
describe('SDR marca a venda vinda de Agendou Pagamento (NPAC-68)', () => {
  /** Lead do Ale com reunião realizada do Ronaldo e pagamento com a Sônia, entrada já paga. */
  const paidLead = async (productId = padrao) => {
    const id = await leadWithMeeting('DONE', 'ronaldo');
    const res = await h.patch(
      `/api/leads/${id}`,
      {
        version: await version(id),
        stageKey: 'AGENDOU_PAGAMENTO',
        paymentProductId: productId,
        paymentCloserId: ids.sonia,
        paymentEntryPaid: true,
      },
      ale,
    );
    expect(res.status, res.text).toBe(200);
    return id;
  };
  const pendingTo = (id: string) =>
    owner<{ user_id: string }[]>`
      select n.user_id from notifications n join lead_timeline t on t.id = n.timeline_id
      where t.lead_id = ${id} and t.kind = 'sale.pending'`;

  it('Venda a registrar com o closer e o produto do pagamento; renda do SDR e aviso só ao closer do pagamento', async () => {
    const id = await paidLead();
    const res = await mark(id);
    expect(res.status, res.text).toBe(201);
    const got = (await h.get(`/api/leads/${id}`, ale)).body;
    expect(got).toMatchObject({
      stageKey: 'VENDA',
      saleToRegister: true,
      soldProductId: padrao,
      closer: { id: ids.sonia },
      paymentProductId: null,
      paymentEntryPaid: false,
    });
    expect(await marks(id)).toMatchObject([
      { sdr_id: ids.ale, product_id: padrao, bonus_cents: 1000, marked_by: ids.ale },
    ]);
    // O closer da reunião (Ronaldo) não é o da venda: o aviso vai só à Sônia.
    expect((await pendingTo(id)).map((n) => n.user_id)).toEqual([ids.sonia]);
  });

  it('o closer do pagamento, sem reunião com o lead, vê a venda a registrar no Hoje e registra', async () => {
    const id = await paidLead();
    expect((await mark(id)).status).toBe(201);
    const forCloser = await h.get(`/api/leads/${id}`, sonia);
    expect(forCloser.status, forCloser.text).toBe(200);
    expect(forCloser.body).toMatchObject({ saleToRegister: true, soldProductId: padrao });
    const today = (await h.post('/api/today/search', {}, sonia)).body.salesToRegister as {
      id: string;
    }[];
    expect(today.map((s) => s.id)).toEqual([id]);
    expect((await register(id)).status).toBe(201);
    // A marcação do SDR continua uma só depois do registro.
    expect(await marks(id)).toHaveLength(1);
  });

  it('produto de outro closer que não o do pagamento → 400 e nada muda', async () => {
    const id = await paidLead();
    // RDV é do Ronaldo; o pagamento é com a Sônia.
    expect((await mark(id, rdv)).status).toBe(400);
    expect((await h.get(`/api/leads/${id}`, ale)).body.stageKey).toBe('AGENDOU_PAGAMENTO');
    expect(await marks(id)).toHaveLength(0);
  });

  it('sem reunião realizada (lead de antes da NPAC-59) → 409 MEETING_DONE_REQUIRED em português', async () => {
    const res = await h.post(
      '/api/leads',
      {
        name: `Lead Pagou Sem Reunião ${++seq}`,
        instagram: `@pagou.sem.reuniao.${seq}`,
        incomeBand: 'R8_15K',
        source: 'BIO',
        stageKey: 'EM_FOLLOW',
      },
      ale,
    );
    expect(res.status, res.text).toBe(201);
    const id = res.body.id as string;
    await owner`update leads set stage_id = (select id from pipeline_stages where key = 'AGENDOU_PAGAMENTO'),
      payment_product_id = ${padrao}, closer_id = ${ids.sonia}, payment_entry_paid = true where id = ${id}`;
    const r = await mark(id);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: 'MEETING_DONE_REQUIRED',
      message: 'Marque a venda depois de uma reunião realizada.',
    });
    expect((await h.get(`/api/leads/${id}`, ale)).body.stageKey).toBe('AGENDOU_PAGAMENTO');
    expect(await marks(id)).toHaveLength(0);
  });

  it('closer não marca (403); a liderança marca pelo SDR e o aviso vai ao SDR e ao closer', async () => {
    const id = await paidLead();
    expect((await mark(id, padrao, sonia)).status).toBe(403);
    expect((await mark(id, padrao, ronaldo)).status).toBe(201);
    expect(await marks(id)).toMatchObject([{ sdr_id: ids.ale, marked_by: ids.ronaldo }]);
    expect((await pendingTo(id)).map((n) => n.user_id).sort()).toEqual([ids.ale, ids.sonia].sort());
  });
});

// NPAC-65 (Igor, 23/11/2026, 15:12): Agendou Pagamento sempre teve reunião. Sem reunião realizada, ao
// mover ou no cadastro direto na etapa, a reunião que já aconteceu vem junto (`meetingDone`, como o
// NPAC-62). Quem já está na etapa sem reunião não muda sozinho (4.4B).
describe('Agendou Pagamento pede a reunião que já aconteceu (NPAC-65)', () => {
  const newLead = async (extra: Record<string, unknown> = {}) =>
    h.post(
      '/api/leads',
      {
        name: `Lead Reunião Passada ${++seq}`,
        instagram: `@reuniao.passada.${seq}`,
        incomeBand: 'R8_15K',
        source: 'BIO',
        stageKey: 'EM_FOLLOW',
        ...extra,
      },
      ale,
    );
  const past = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  const payment = () => ({ paymentProductId: padrao, paymentCloserId: ids.sonia });
  const meetingsOf = (id: string) =>
    owner<{ outcome: string | null; same: boolean; closer_id: string; origin: string }[]>`
      select outcome, outcome_at = scheduled_at as same, closer_id, origin from meetings where lead_id = ${id}`;
  const stageOf = async (id: string) =>
    (await h.get(`/api/leads/${id}`, ale)).body.stageKey as string;

  it('mover sem reunião realizada: a que já aconteceu entra junto e conta no dia dela', async () => {
    const res = await newLead();
    const id = res.body.id as string;
    const move = async (meetingDone?: Record<string, unknown>) =>
      h.patch(
        `/api/leads/${id}`,
        {
          version: await version(id),
          stageKey: 'AGENDOU_PAGAMENTO',
          ...payment(),
          ...(meetingDone ? { meetingDone } : {}),
        },
        ale,
      );
    const without = await move();
    expect(without.status).toBe(409);
    expect(without.body.code).toBe('MEETING_DONE_REQUIRED');
    const future = new Date(Date.now() + DAY).toISOString();
    expect(
      (await move({ scheduledAt: future, closerId: ids.sonia, origin: 'DIRETO' })).status,
    ).toBe(400);
    const when = past(2);
    const ok = await move({ scheduledAt: when, closerId: ids.sonia, origin: 'FOLLOW' });
    expect(ok.status, ok.text).toBe(200);
    expect(await stageOf(id)).toBe('AGENDOU_PAGAMENTO');
    expect(await meetingsOf(id)).toEqual([
      { outcome: 'DONE', same: true, closer_id: ids.sonia, origin: 'FOLLOW' },
    ]);
    const day = spDay(new Date(when));
    const then = await h.post('/api/reports/search', { period: 'RANGE', from: day, to: day }, ale);
    expect(then.body.metrics).toMatchObject({ done: 1, meetingValueCents: 700 });
    // Com a reunião realizada, o SDR marca a venda quando o cliente paga (NPAC-68).
    expect((await mark(id)).status).toBe(201);
  });

  it('cadastro direto em Agendou Pagamento com a reunião que já aconteceu; sem ela, 409', async () => {
    const without = await newLead({ stageKey: 'AGENDOU_PAGAMENTO', ...payment() });
    expect(without.status).toBe(409);
    expect(without.body.code).toBe('MEETING_DONE_REQUIRED');
    const res = await newLead({
      stageKey: 'AGENDOU_PAGAMENTO',
      ...payment(),
      paymentEntryPaid: true,
      meetingDone: { scheduledAt: past(1), closerId: ids.sonia, origin: 'DIRETO' },
    });
    expect(res.status, res.text).toBe(201);
    const id = res.body.id as string;
    expect((await h.get(`/api/leads/${id}`, ale)).body).toMatchObject({
      stageKey: 'AGENDOU_PAGAMENTO',
      paymentProductId: padrao,
      paymentEntryPaid: true,
      closer: { id: ids.sonia },
    });
    expect(await meetingsOf(id)).toEqual([
      { outcome: 'DONE', same: true, closer_id: ids.sonia, origin: 'DIRETO' },
    ]);
  });

  it('closer não lança a reunião (403); fora da entrada em Agendou Pagamento, 400', async () => {
    const id = (await newLead()).body.id as string;
    // A Sônia enxerga o lead pela reunião marcada (futura) com ela.
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${id}, ${ids.sonia}, now() + interval '2 days', 'DIRETO', ${ids.ale})`;
    const closer = await h.patch(
      `/api/leads/${id}`,
      {
        version: await version(id, sonia),
        stageKey: 'AGENDOU_PAGAMENTO',
        paymentProductId: padrao,
        paymentAmountCents: 300_000,
        nextContactAt: new Date(Date.now() + DAY).toISOString(),
        meetingDone: { scheduledAt: past(1), closerId: ids.sonia, origin: 'DIRETO' },
      },
      sonia,
    );
    expect(closer.status).toBe(403);
    const other = await h.patch(
      `/api/leads/${id}`,
      {
        version: await version(id),
        stageKey: 'NO_SHOW',
        meetingDone: { scheduledAt: past(1), closerId: ids.sonia, origin: 'DIRETO' },
      },
      ale,
    );
    expect(other.status).toBe(400);
  });
});

// NPAC-65 (Igor, 23/11/2026, "4.1A, 4.3A, 2.1A"): venda direta do SDR, sem reunião, à vista, no cartão
// ou no boleto. O SDR escolhe o closer e o produto; o lead vai para Venda a registrar, o closer
// escolhido põe o valor e o SDR ganha a renda extra sem somar reunião. Vale na ficha e no cadastro.
describe('venda direta do SDR (NPAC-65)', () => {
  const plainLead = async () => {
    const res = await h.post(
      '/api/leads',
      {
        name: `Lead Venda Direta ${++seq}`,
        instagram: `@venda.direta.${seq}`,
        incomeBand: 'R8_15K',
        source: 'BIO',
        stageKey: 'EM_FOLLOW',
      },
      ale,
    );
    expect(res.status, res.text).toBe(201);
    return res.body.id as string;
  };
  const direct = async (id: string, productId = padrao, closerId = ids.sonia, cookie = ale) =>
    h.post(
      `/api/leads/${id}/sale-mark`,
      { version: await version(id, cookie), productId, directSale: { closerId } },
      cookie,
    );
  const markMeetings = (id: string) =>
    owner<{ meeting_id: string | null; bonus_cents: number }[]>`
      select meeting_id, bonus_cents from sdr_sale_marks where lead_id = ${id} and canceled_at is null`;
  const pendingTo = (id: string) =>
    owner<{ user_id: string }[]>`
      select n.user_id from notifications n join lead_timeline t on t.id = n.timeline_id
      where t.lead_id = ${id} and t.kind = 'sale.pending'`;

  it('ficha: sem reunião, o SDR escolhe o closer; venda a registrar, renda e nenhuma reunião', async () => {
    const id = await plainLead();
    const res = await direct(id);
    expect(res.status, res.text).toBe(201);
    expect((await h.get(`/api/leads/${id}`, ale)).body).toMatchObject({
      stageKey: 'VENDA',
      saleToRegister: true,
      soldProductId: padrao,
      closer: { id: ids.sonia },
    });
    expect(await markMeetings(id)).toEqual([{ meeting_id: null, bonus_cents: 1000 }]);
    expect((await pendingTo(id)).map((n) => n.user_id)).toEqual([ids.sonia]);
    expect(await owner`select 1 from meetings where lead_id = ${id}`).toHaveLength(0);
    const sdr = (await dashboard()).body;
    expect(sdr.saleBonus).toMatchObject({ count: 1, cents: 1000 });
    expect(sdr.metrics).toMatchObject({ sales: 1, done: 0, meetingValueCents: 0 });
    // A closer escolhida vê o lead no Hoje (sem reunião com ele) e registra à vista; Parcial, não.
    const hoje = (await h.post('/api/today/search', {}, sonia)).body.salesToRegister as {
      id: string;
    }[];
    expect(hoje.map((s) => s.id)).toContain(id);
    const partial = await h.post(
      '/api/finance/deals',
      {
        leadId: id,
        productId: padrao,
        closerId: ids.sonia,
        version: await version(id, sonia),
        totalCents: 300_000,
        method: 'PARTIAL',
        entryCents: 100_000,
        installments: [
          { amountCents: 200_000, dueAt: new Date(Date.now() + 10 * DAY).toISOString() },
        ],
        requestKey: randomUUID(),
      },
      sonia,
    );
    expect(partial.status).toBe(400);
    expect(partial.body.message).toBe(
      'Venda direta é à vista, no cartão ou no boleto, sem entrada.',
    );
    expect((await register(id)).status).toBe(201);
    expect(await markMeetings(id)).toHaveLength(1);
  });

  it('com reunião realizada ou em Agendou Pagamento não é venda direta (409); produto de outro closer, 400; closer, 403', async () => {
    const withMeeting = await leadWithMeeting();
    const a = await direct(withMeeting);
    expect(a.status).toBe(409);
    expect(a.body.code).toBe('NOT_DIRECT_SALE');
    const paying = await plainLead();
    await owner`update leads set stage_id = (select id from pipeline_stages where key = 'AGENDOU_PAGAMENTO'),
      payment_product_id = ${padrao}, closer_id = ${ids.sonia} where id = ${paying}`;
    expect((await direct(paying)).body.code).toBe('NOT_DIRECT_SALE');
    const id = await plainLead();
    // RDV é do Ronaldo; a closer escolhida é a Sônia.
    expect((await direct(id, rdv)).status).toBe(400);
    expect((await direct(id, padrao, ids.sonia, sonia)).status).toBe(403);
    expect(await markMeetings(id)).toEqual([]);
    // A liderança marca pelo SDR: o aviso vai ao SDR e à closer escolhida.
    expect((await direct(id, rdv, ids.ronaldo, ronaldo)).status).toBe(201);
    expect(await marks(id)).toMatchObject([{ sdr_id: ids.ale, marked_by: ids.ronaldo }]);
  });

  it('cadastro em Venda Fechada como venda direta (4.3A); com a reunião junto, 400', async () => {
    const base = {
      incomeBand: 'R8_15K',
      source: 'BIO',
      stageKey: 'VENDA',
      soldProductId: padrao,
    };
    const res = await h.post(
      '/api/leads',
      {
        ...base,
        name: `Lead Cadastro Direta ${++seq}`,
        instagram: `@cadastro.direta.${seq}`,
        directSale: { closerId: ids.sonia },
      },
      ale,
    );
    expect(res.status, res.text).toBe(201);
    const id = res.body.id as string;
    expect((await h.get(`/api/leads/${id}`, ale)).body).toMatchObject({
      stageKey: 'VENDA',
      saleToRegister: true,
      closer: { id: ids.sonia },
    });
    expect(await owner`select 1 from meetings where lead_id = ${id}`).toHaveLength(0);
    expect(await markMeetings(id)).toEqual([{ meeting_id: null, bonus_cents: 1000 }]);
    const both = await h.post(
      '/api/leads',
      {
        ...base,
        name: `Lead Cadastro Direta ${++seq}`,
        instagram: `@cadastro.direta.${seq}`,
        directSale: { closerId: ids.sonia },
        meeting: { scheduledAt: new Date(Date.now() - DAY).toISOString(), closerId: ids.sonia },
      },
      ale,
    );
    expect(both.status).toBe(400);
  });
});

describe('reunião já realizada lançada depois (NPAC-62, "1A, 2A")', () => {
  /** Lead do Ale em Em follow, sem reunião (como a lead do Igor, de antes do CRM). */
  const leadWithoutMeeting = async () => {
    const res = await h.post(
      '/api/leads',
      {
        name: `Lead Reunião Antiga ${++seq}`,
        instagram: `@reuniao.antiga.${seq}`,
        incomeBand: 'R8_15K',
        source: 'BIO',
        stageKey: 'EM_FOLLOW',
      },
      ale,
    );
    expect(res.status, res.text).toBe(201);
    return res.body.id as string;
  };
  const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
  const logDone = (leadId: string, scheduledAt: string, cookie: Cookie = ale) =>
    h.post(
      '/api/meetings/done',
      { leadId, closerId: ids.sonia, scheduledAt, origin: 'DIRETO' },
      cookie,
    );
  const day = (iso: string) => spDay(new Date(iso));
  const dashboardOn = (d: string, cookie: Cookie = ale) =>
    h.post('/api/reports/search', { period: 'RANGE', from: d, to: d }, cookie);

  it('o SDR lança: entra realizada e conta o valor da reunião no dia em que aconteceu (2A)', async () => {
    const id = await leadWithoutMeeting();
    const when = daysAgo(3);
    const res = await logDone(id, when);
    expect(res.status, res.text).toBe(201);
    const [m] = await owner<{ outcome: string; outcome_at: Date; scheduled_at: Date }[]>`
      select outcome, outcome_at, scheduled_at from meetings where lead_id = ${id}`;
    expect(m!.outcome).toBe('DONE');
    expect(m!.outcome_at.getTime()).toBe(new Date(when).getTime());
    const then = (await dashboardOn(day(when))).body.metrics;
    expect(then).toMatchObject({ done: 1, meetingValueCents: 700 });
    expect((await dashboard()).body.metrics.done).toBe(0);
    const kinds = await owner<{ kind: string }[]>`
      select kind from lead_timeline where lead_id = ${id} order by kind`;
    expect(kinds.map((k) => k.kind)).toEqual(
      expect.arrayContaining(['meeting.scheduled', 'meeting.outcome']),
    );
  });

  it('a liderança lança no lead de um SDR (1A)', async () => {
    const id = await leadWithoutMeeting();
    expect((await logDone(id, daysAgo(1), ronaldo)).status).toBe(201);
  });

  it('closer não lança (403) e outro SDR não vê o lead (404)', async () => {
    const id = await leadWithoutMeeting();
    expect((await logDone(id, daysAgo(1), sonia)).status).toBe(403);
    expect((await logDone(id, daysAgo(1), murilo)).status).toBe(404);
    expect(await owner`select 1 from meetings where lead_id = ${id}`).toHaveLength(0);
  });

  it('horário futuro ou de mais de um ano atrás: 400', async () => {
    const id = await leadWithoutMeeting();
    const future = new Date(Date.now() + DAY).toISOString();
    expect((await logDone(id, future)).status).toBe(400);
    expect((await logDone(id, daysAgo(400))).status).toBe(400);
  });

  it('venda registrada de Agendou Pagamento sem reunião (caso do Igor): a reunião lançada dá a renda', async () => {
    const id = await leadWithoutMeeting();
    // Lead que entrou em Agendou Pagamento antes da regra da reunião realizada (NPAC-59).
    await owner`update leads set stage_id = (select id from pipeline_stages where key = 'AGENDOU_PAGAMENTO'),
      payment_product_id = ${promo}, closer_id = ${ids.sonia} where id = ${id}`;
    const sale = await register(id, padrao, ronaldo);
    expect(sale.status, sale.text).toBe(201);
    expect(await marks(id)).toEqual([]);
    const res = await logDone(id, daysAgo(5));
    expect(res.status, res.text).toBe(201);
    // A renda segue o produto da venda, na data da venda, e quem lançou fica como autor.
    expect(await marks(id)).toMatchObject([
      {
        sdr_id: ids.ale,
        product_id: padrao,
        bonus_cents: 1000,
        marked_by: ids.ale,
        canceled_at: null,
      },
    ]);
    expect((await dashboard()).body.saleBonus).toMatchObject({ count: 1, cents: 1000 });
    // Lançar outra não duplica.
    expect((await logDone(id, daysAgo(4))).status).toBe(201);
    expect(await marks(id)).toHaveLength(1);
  });

  it('venda registrada direto, sem Agendou Pagamento, continua sem renda (2B de 17/11)', async () => {
    const id = await leadWithoutMeeting();
    expect((await register(id, padrao, ronaldo)).status).toBe(201);
    expect((await logDone(id, daysAgo(2))).status).toBe(201);
    expect(await marks(id)).toEqual([]);
  });

  it('depois da reunião lançada, o lead pode ir para Agendou Pagamento', async () => {
    const id = await leadWithoutMeeting();
    expect((await logDone(id, daysAgo(2))).status).toBe(201);
    const res = await h.patch(
      `/api/leads/${id}`,
      {
        version: await version(id),
        stageKey: 'AGENDOU_PAGAMENTO',
        paymentProductId: padrao,
        paymentCloserId: ids.sonia,
      },
      ale,
    );
    expect(res.status, res.text).toBe(200);
  });
});
