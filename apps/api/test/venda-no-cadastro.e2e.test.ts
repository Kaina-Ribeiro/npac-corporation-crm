import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderScheduler } from '../src/push/reminders.js';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// Venda Fechada no cadastro (NPAC-39, Gabriel 05/11/2026): quem cadastra informa a reunião (já
// realizada, o SDR recebe por ela) e, se pode registrar venda, a venda no fim do formulário. Sem
// a venda, o lead fica em Venda como "venda a registrar" e o closer da reunião é avisado.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
type Who = 'ale' | 'murilo' | 'ronaldo' | 'sonia';
let ids: Record<Who, string>;
let ale: Cookie, sonia: Cookie, ronaldo: Cookie;
let rdv: string, nacao: string;

let seq = 0;
const lead = (over: Record<string, unknown> = {}) => ({
  name: 'Maria Venda',
  instagram: `@maria.venda.${++seq}`,
  incomeBand: 'R8_15K',
  source: 'BIO',
  stageKey: 'VENDA',
  // Produto vendido (NPAC-41): da Sônia, closer padrão das reuniões; com a venda, vale o dela.
  soldProductId: nacao,
  ...over,
});
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
/** Dia de Brasília (AAAA-MM-DD). */
const spDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const pastMeeting = (closer: Who = 'sonia', when = daysAgo(3)) => ({
  scheduledAt: when.toISOString(),
  closerId: ids[closer],
});
/** Venda Parcial: R$ 18.000 = R$ 6.000 pagos + R$ 12.000 daqui a 20 dias. */
const sale = (over: Record<string, unknown> = {}) => ({
  closedOn: spDay(daysAgo(2)),
  productId: rdv,
  method: 'PARTIAL',
  totalCents: 1_800_000,
  entryCents: 600_000,
  installments: [{ amountCents: 1_200_000, dueAt: new Date(Date.now() + 20 * DAY).toISOString() }],
  requestKey: randomUUID(),
  ...over,
});

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id])) as Record<Who, string>;
  const ps = await owner<{ id: string; code: string }[]>`select id, code from products`;
  rdv = ps.find((p) => p.code === 'RDV')!.id;
  nacao = ps.find((p) => p.code === 'NACAO_PADRAO')!.id;
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  ronaldo = await h.signIn('ronaldo@npac.com.br');
});

async function create(body: object, cookie: Cookie = ale): Promise<string> {
  const res = await h.post('/api/leads', body, cookie);
  if (res.status !== 201) throw new Error(`criação falhou (${res.status}): ${res.text}`);
  return res.body.id;
}
const nothingWritten = async () => {
  expect(await owner`select id from leads`).toHaveLength(0);
  expect(await owner`select id from meetings`).toHaveLength(0);
  expect(await owner`select id from deals`).toHaveLength(0);
};
const timelineKinds = async (id: string) =>
  (await owner<{ kind: string }[]>`select kind from lead_timeline where lead_id = ${id}`)
    .map((t) => t.kind)
    .sort();
const search = (day: Date, cookie: Cookie, over: Record<string, unknown> = {}) =>
  h.post(
    '/api/reports/search',
    { period: 'RANGE', from: spDay(day), to: spDay(day), ...over },
    cookie,
  );

describe('SDR cadastra em Venda Fechada', () => {
  it('sem a reunião → 409 MEETING_REQUIRED e nada gravado', async () => {
    const res = await h.post('/api/leads', lead(), ale);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MEETING_REQUIRED');
    expect(res.body.message).toMatch(/Venda Fechada/);
    await nothingWritten();
  });

  it('reunião no futuro → 400 "A reunião ainda não aconteceu"', async () => {
    const res = await h.post(
      '/api/leads',
      lead({ meeting: pastMeeting('sonia', new Date(Date.now() + DAY)) }),
      ale,
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ainda não aconteceu/);
    await nothingWritten();
  });

  it('SDR mandando dados da venda → 403 e nada gravado', async () => {
    const res = await h.post('/api/leads', lead({ meeting: pastMeeting(), sale: sale() }), ale);
    expect(res.status).toBe(403);
    await nothingWritten();
  });

  it('cria lead em Venda + reunião realizada + venda a registrar + aviso ao closer', async () => {
    const when = daysAgo(3);
    const id = await create(lead({ meeting: pastMeeting('sonia', when) }));

    const got = (await h.get(`/api/leads/${id}`, ale)).body;
    expect(got.stageKey).toBe('VENDA');
    expect(got.saleToRegister).toBe(true);

    const ms = await owner<
      {
        outcome: string;
        outcome_at: Date;
        scheduled_at: Date;
        origin: string;
        created_by: string;
      }[]
    >`select outcome, outcome_at, scheduled_at, origin, created_by from meetings where lead_id = ${id}`;
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ outcome: 'DONE', origin: 'DIRETO', created_by: ids.ale });
    expect(ms[0]!.outcome_at.getTime()).toBe(ms[0]!.scheduled_at.getTime());
    expect(ms[0]!.scheduled_at.getTime()).toBe(new Date(when.toISOString()).getTime());
    expect(await owner`select id from deals`).toHaveLength(0);

    expect(await timelineKinds(id)).toEqual([
      'lead.created',
      'meeting.outcome',
      'meeting.scheduled',
      'sale.pending',
    ]);
    // O closer da reunião recebe o pedido de registro (aviso só com IDs).
    const [pending] = await owner<{ user_id: string }[]>`
      select n.user_id from notifications n join lead_timeline t on t.id = n.timeline_id
      where t.lead_id = ${id} and t.kind = 'sale.pending'`;
    expect(pending?.user_id).toBe(ids.sonia);
    // O closer vê o lead pela reunião e o aviso no Inbox.
    expect((await h.get(`/api/leads/${id}`, sonia)).status).toBe(200);

    // Valor por reunião realizada (P1 = R$ 7) no dia da reunião, não no do cadastro.
    const thatDay = await search(when, ale);
    expect(thatDay.body.metrics).toMatchObject({ done: 1, meetingValueCents: 700 });
    const today = await search(new Date(), ale);
    expect(today.body.metrics).toMatchObject({ done: 0, meetingValueCents: 0 });
  });

  it('o card do Pipeline marca a venda a registrar', async () => {
    const id = await create(lead({ meeting: pastMeeting() }));
    const res = await h.get('/api/leads/pipeline?stage=VENDA', ale);
    expect(res.status).toBe(200);
    const venda = res.body.find((c: { stage: { key: string } }) => c.stage.key === 'VENDA');
    expect(venda.items).toEqual([expect.objectContaining({ id, saleToRegister: true })]);
  });

  it('lembretes são rearmados depois do commit', async () => {
    const rearm = vi.spyOn(app.get(ReminderScheduler), 'rearm');
    await create(lead({ meeting: pastMeeting() }));
    expect(rearm).toHaveBeenCalledTimes(1);
    rearm.mockRestore();
  });

  it('venda a registrar pode sair de Venda pelo PATCH; entrar continua recusado', async () => {
    const id = await create(lead({ meeting: pastMeeting() }));
    const out = await h.patch(`/api/leads/${id}`, { version: 1, stageKey: 'EM_FOLLOW' }, ale);
    expect(out.status).toBe(200);
    const back = await h.patch(`/api/leads/${id}`, { version: 2, stageKey: 'VENDA' }, ale);
    expect(back.status).toBe(409);
    expect(back.body.code).toBe('SALE_REQUIRED');
  });
});

describe('liderança cadastra com a venda', () => {
  it('lead + reunião + venda + parcelas + pagamento numa transação', async () => {
    const s = sale();
    const id = await create(
      lead({ sdrId: ids.ale, meeting: pastMeeting('ronaldo', daysAgo(4)), sale: s }),
      ronaldo,
    );
    const got = (await h.get(`/api/leads/${id}`, ronaldo)).body;
    expect(got.stageKey).toBe('VENDA');
    expect(got.saleToRegister).toBe(false);

    const [d] = await owner<
      {
        id: string;
        closer_id: string;
        sdr_id: string;
        closed_at: Date;
        previous_stage_id: string;
      }[]
    >`select id, closer_id, sdr_id, closed_at, previous_stage_id from deals where lead_id = ${id}`;
    expect(d).toMatchObject({ closer_id: ids.ronaldo, sdr_id: ids.ale });
    expect(spDay(d!.closed_at)).toBe(s.closedOn);
    const [follow] = await owner<{ id: string }[]>`
      select id from pipeline_stages where key = 'EM_FOLLOW'`;
    expect(d!.previous_stage_id).toBe(follow!.id);

    const pays = await owner<{ amount_cents: number; paid_at: Date | null; due_at: Date }[]>`
      select amount_cents, paid_at, due_at from payments where deal_id = ${d!.id} order by due_at`;
    expect(pays.map((p) => p.amount_cents)).toEqual([600_000, 1_200_000]);
    expect(pays[0]!.paid_at?.getTime()).toBe(d!.closed_at.getTime());
    expect(pays[1]!.paid_at).toBeNull();

    expect(await timelineKinds(id)).toEqual([
      'lead.created',
      'meeting.outcome',
      'meeting.scheduled',
      'sale.registered',
    ]);

    // A venda entra no relatório do dia da venda, não no de hoje.
    const thatDay = await search(daysAgo(2), ronaldo);
    expect(thatDay.body.metrics).toMatchObject({ sales: 1, soldCents: 1_800_000 });
    const today = await search(new Date(), ronaldo);
    expect(today.body.metrics).toMatchObject({ sales: 0, soldCents: 0 });
  });

  it('Pix: total pago na data da venda; venda de hoje fica no horário do registro', async () => {
    const before = Date.now();
    const id = await create(
      lead({
        sdrId: ids.ale,
        meeting: pastMeeting('sonia', new Date(Date.now() - 3_600_000)),
        sale: sale({
          closedOn: spDay(new Date()),
          productId: nacao,
          method: 'PIX',
          totalCents: 300_000,
          entryCents: 0,
          installments: [],
        }),
      }),
      ronaldo,
    );
    const [d] = await owner<{ id: string; closed_at: Date; closer_id: string }[]>`
      select id, closed_at, closer_id from deals where lead_id = ${id}`;
    expect(d!.closer_id).toBe(ids.sonia);
    expect(d!.closed_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(d!.closed_at.getTime()).toBeLessThanOrEqual(Date.now());
    const pays = await owner<{ amount_cents: number; paid_at: Date }[]>`
      select amount_cents, paid_at from payments where deal_id = ${d!.id}`;
    expect(pays).toEqual([{ amount_cents: 300_000, paid_at: d!.closed_at }]);
  });

  it('data da venda futura, soma errada ou produto de outro closer → 400 e nada gravado', async () => {
    const tomorrow = spDay(new Date(Date.now() + DAY));
    for (const bad of [
      sale({ closedOn: tomorrow }),
      sale({ entryCents: 500_000 }),
      sale({ productId: nacao }),
      sale({
        installments: [{ amountCents: 1_200_000, dueAt: daysAgo(1).toISOString() }],
      }),
    ]) {
      const res = await h.post(
        '/api/leads',
        lead({ sdrId: ids.ale, meeting: pastMeeting('ronaldo'), sale: bad }),
        ronaldo,
      );
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    await nothingWritten();
  });

  it('idempotente pela requestKey: repetir devolve o mesmo lead; outro corpo → 409', async () => {
    const body = lead({ sdrId: ids.ale, meeting: pastMeeting('ronaldo'), sale: sale() });
    const a = await h.post('/api/leads', body, ronaldo);
    const b = await h.post('/api/leads', body, ronaldo);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(await owner`select id from leads`).toHaveLength(1);
    expect(await owner`select id from deals`).toHaveLength(1);
    const c = await h.post('/api/leads', { ...body, name: 'Outra Pessoa' }, ronaldo);
    expect(c.status).toBe(409);
  });
});

describe('venda a registrar depois', () => {
  it('registrar pela ficha mantém em Venda; o estorno devolve para Em follow', async () => {
    const id = await create(lead({ meeting: pastMeeting() }));
    const reg = await h.post(
      '/api/finance/deals',
      {
        leadId: id,
        productId: nacao,
        closerId: ids.sonia,
        version: 1,
        totalCents: 300_000,
        method: 'PIX',
        requestKey: randomUUID(),
      },
      sonia,
    );
    expect(reg.status).toBe(201);
    let got = (await h.get(`/api/leads/${id}`, sonia)).body;
    expect(got).toMatchObject({ stageKey: 'VENDA', saleToRegister: false });

    const rev = await h.post(`/api/finance/deals/${reg.body.id}/reverse`, { version: 1 }, ronaldo);
    expect(rev.status).toBe(200);
    got = (await h.get(`/api/leads/${id}`, ronaldo)).body;
    expect(got).toMatchObject({ stageKey: 'EM_FOLLOW', saleToRegister: false });
  });
});

// Produto vendido no cadastro (NPAC-41, Igor 06/11/2026, "2A"): obrigatório sem a venda, só o
// nome na tela do SDR; o closer põe os valores ao registrar.
describe('produto vendido na venda a registrar', () => {
  it('sem o produto → 409 PRODUCT_REQUIRED e nada gravado', async () => {
    const res = await h.post(
      '/api/leads',
      lead({ meeting: pastMeeting(), soldProductId: undefined }),
      ale,
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRODUCT_REQUIRED');
    expect(res.body.message).toMatch(/produto/);
    await nothingWritten();
  });

  it('produto de outro closer → 400 e nada gravado', async () => {
    const res = await h.post(
      '/api/leads',
      lead({ meeting: pastMeeting(), soldProductId: rdv }),
      ale,
    );
    expect(res.status).toBe(400);
    await nothingWritten();
  });

  it('guarda o produto; o closer registra e ele some', async () => {
    const id = await create(lead({ meeting: pastMeeting() }));
    expect((await h.get(`/api/leads/${id}`, sonia)).body).toMatchObject({
      saleToRegister: true,
      soldProductId: nacao,
    });
    const reg = await h.post(
      '/api/finance/deals',
      {
        leadId: id,
        productId: nacao,
        closerId: ids.sonia,
        version: 1,
        totalCents: 300_000,
        method: 'PIX',
        requestKey: randomUUID(),
      },
      sonia,
    );
    expect(reg.status).toBe(201);
    expect((await h.get(`/api/leads/${id}`, sonia)).body.soldProductId).toBeNull();
    expect(await owner`select id from leads where sold_product_id is not null`).toHaveLength(0);
  });

  it('sair de Venda pelo PATCH apaga o produto; com a venda já registrada nem grava', async () => {
    const id = await create(lead({ meeting: pastMeeting() }));
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, stageKey: 'EM_FOLLOW' }, ale)).status,
    ).toBe(200);
    expect(await owner`select id from leads where sold_product_id is not null`).toHaveLength(0);

    await create(lead({ sdrId: ids.ale, meeting: pastMeeting('ronaldo'), sale: sale() }), ronaldo);
    expect(await owner`select id from leads where sold_product_id is not null`).toHaveLength(0);
  });
});
