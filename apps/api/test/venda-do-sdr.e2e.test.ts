import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, sdr_sale_marks, leads`;
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
    });
    expect((await dashboard(murilo)).body.saleBonus.cents).toBe(1000);
  });

  it('conta na data da marcação (1A): marcação de ontem fica fora do período de hoje', async () => {
    const id = await leadWithMeeting();
    await mark(id);
    await owner`update sdr_sale_marks set marked_at = now() - interval '1 day' where lead_id = ${id}`;
    expect((await dashboard()).body.saleBonus).toEqual({ cents: 0, count: 0, byProduct: [] });
    const yesterday = spDay(new Date(Date.now() - DAY));
    const res = await h.post(
      '/api/reports/search',
      { period: 'RANGE', from: yesterday, to: yesterday },
      ale,
    );
    expect(res.body.saleBonus.cents).toBe(1000);
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
    expect((await dashboard()).body.saleBonus).toEqual({ cents: 0, count: 0, byProduct: [] });
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
