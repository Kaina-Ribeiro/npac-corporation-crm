import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderScheduler } from '../src/push/reminders.js';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// Campos por etapa (NPAC-38, pedido do cliente de 05/11/2026; decisões 1A 2A 3A): cada etapa pede
// os dados dela no cadastro e na troca de etapa; a API recusa sem eles (409), como a Venda.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
type Who = 'ale' | 'murilo' | 'ronaldo' | 'sonia';
let ids: Record<Who, string>;
let ale: Cookie, sonia: Cookie, ronaldo: Cookie;
let productId: string;

let seq = 0;
const lead = (over: Record<string, unknown> = {}) => ({
  name: 'Maria Etapa',
  instagram: `@maria.etapa.${++seq}`,
  incomeBand: 'R8_15K',
  source: 'BIO',
  ...over,
});
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const meeting = () => ({ scheduledAt: inDays(3), closerId: ids.sonia });

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id])) as Record<Who, string>;
  const [p] = await owner<{ id: string }[]>`select id from products where code = 'RDV'`;
  productId = p!.id;
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
const meetingsOf = (id: string) =>
  owner<{ closer_id: string; origin: string; created_by: string }[]>`
    select closer_id, origin, created_by from meetings where lead_id = ${id}`;
const timeline = (id: string) =>
  owner<{ kind: string; fields: string[] }[]>`
    select kind, fields from lead_timeline where lead_id = ${id} order by at, id`;

describe('Agendados pedem a reunião', () => {
  it('cadastro sem reunião → 409 MEETING_REQUIRED; com ela cria lead e reunião juntos', async () => {
    const miss = await h.post('/api/leads', lead({ stageKey: 'AGENDADO_DIRETO' }), ale);
    expect(miss.status).toBe(409);
    expect(miss.body.code).toBe('MEETING_REQUIRED');
    expect(miss.body.message).toMatch(/reunião/);
    expect(await owner`select id from leads`).toHaveLength(0);

    const id = await create(lead({ stageKey: 'AGENDADO_DIRETO', meeting: meeting() }));
    expect(await meetingsOf(id)).toEqual([
      { closer_id: ids.sonia, origin: 'DIRETO', created_by: ids.ale },
    ]);
    // Mesma transação, mesmo instante: a ordem entre os dois não é garantida.
    expect((await timeline(id)).map((t) => t.kind).sort()).toEqual([
      'lead.created',
      'meeting.scheduled',
    ]);
    // Closer da reunião passa a ver o lead pela agenda.
    expect((await h.get(`/api/leads/${id}`, sonia)).status).toBe(200);
  });

  it('lembretes são rearmados depois de criar a reunião, não sem ela', async () => {
    const rearm = vi.spyOn(app.get(ReminderScheduler), 'rearm');
    const id = await create(lead());
    expect(rearm).not.toHaveBeenCalled();
    await h.patch(
      `/api/leads/${id}`,
      { version: 1, stageKey: 'AGENDADO_DIRETO', meeting: meeting() },
      ale,
    );
    expect(rearm).toHaveBeenCalledTimes(1);
    await create(lead({ stageKey: 'AGENDADO_FOLLOW', meeting: meeting() }));
    expect(rearm).toHaveBeenCalledTimes(2);
    rearm.mockRestore();
  });

  it('reunião que falha desfaz o lead (closer inválido)', async () => {
    const res = await h.post(
      '/api/leads',
      lead({ stageKey: 'AGENDADO_FOLLOW', meeting: { ...meeting(), closerId: ids.murilo } }),
      ale,
    );
    expect(res.status).toBe(400);
    expect(await owner`select id from leads`).toHaveLength(0);
    expect(await owner`select id from meetings`).toHaveLength(0);
  });

  it('PATCH para Agendado do Follow cria a reunião com origem FOLLOW', async () => {
    const id = await create(lead());
    const miss = await h.patch(
      `/api/leads/${id}`,
      { version: 1, stageKey: 'AGENDADO_FOLLOW' },
      ale,
    );
    expect(miss.status).toBe(409);
    expect(miss.body.code).toBe('MEETING_REQUIRED');
    const ok = await h.patch(
      `/api/leads/${id}`,
      { version: 1, stageKey: 'AGENDADO_FOLLOW', meeting: meeting() },
      ale,
    );
    expect(ok.status).toBe(200);
    expect((await meetingsOf(id)).map((m) => m.origin)).toEqual(['FOLLOW']);
    expect((await get(id)).stageKey).toBe('AGENDADO_FOLLOW');
  });

  it('PATCH com reunião que falha não muda a etapa', async () => {
    const id = await create(lead());
    const res = await h.patch(
      `/api/leads/${id}`,
      { version: 1, stageKey: 'AGENDADO_DIRETO', meeting: { ...meeting(), closerId: ids.ale } },
      ale,
    );
    expect(res.status).toBe(400);
    expect((await get(id)).stageKey).toBe('SONDAGEM');
    expect((await get(id)).version).toBe(1);
  });

  it('com reunião futura aberta não pede de novo', async () => {
    const id = await create(lead());
    expect(
      (await h.post('/api/meetings', { leadId: id, origin: 'DIRETO', ...meeting() }, ale)).status,
    ).toBe(201);
    const res = await h.patch(`/api/leads/${id}`, { version: 1, stageKey: 'AGENDADO_DIRETO' }, ale);
    expect(res.status).toBe(200);
    expect(await meetingsOf(id)).toHaveLength(1);
  });

  it('reunião cancelada ou passada não conta como marcada', async () => {
    const id = await create(lead());
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, canceled_at)
      values (${id}, ${ids.sonia}, now() + interval '2 days', 'DIRETO', ${ids.ale}, now())`;
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${id}, ${ids.sonia}, now() - interval '2 days', 'DIRETO', ${ids.ale})`;
    const res = await h.patch(`/api/leads/${id}`, { version: 1, stageKey: 'AGENDADO_DIRETO' }, ale);
    expect(res.status).toBe(409);
  });
});

describe('Agendou Pagamento pede data, produto e valor', () => {
  it('sem os três → 409 PAYMENT_REQUIRED; com eles grava no lead', async () => {
    const id = await create(lead());
    for (const partial of [
      {},
      { nextContactAt: inDays(5), paymentProductId: productId },
      { paymentProductId: productId, paymentAmountCents: 450000 },
    ]) {
      const res = await h.patch(
        `/api/leads/${id}`,
        { version: 1, stageKey: 'AGENDOU_PAGAMENTO', ...partial },
        ale,
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAYMENT_REQUIRED');
    }
    const at = inDays(5);
    const ok = await h.patch(
      `/api/leads/${id}`,
      {
        version: 1,
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: at,
        paymentProductId: productId,
        paymentAmountCents: 450000,
      },
      ale,
    );
    expect(ok.status).toBe(200);
    expect(await get(id)).toMatchObject({
      stageKey: 'AGENDOU_PAGAMENTO',
      nextContactAt: at,
      paymentProductId: productId,
      paymentAmountCents: 450000,
    });
    // Timeline guarda só o nome do campo, nunca o valor.
    const last = (await timeline(id)).at(-1)!;
    expect(last.fields).toEqual(expect.arrayContaining(['stageKey', 'nextContactAt', 'payment']));
    expect(JSON.stringify(last)).not.toContain('450000');
  });

  it('produto inexistente → 400', async () => {
    const res = await h.post(
      '/api/leads',
      lead({
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(5),
        paymentProductId: randomUUID(),
        paymentAmountCents: 1000,
      }),
      ale,
    );
    expect(res.status).toBe(400);
  });

  it('cadastro já em Agendou Pagamento', async () => {
    const id = await create(
      lead({
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(5),
        paymentProductId: productId,
        paymentAmountCents: 300000,
      }),
    );
    expect((await get(id)).paymentAmountCents).toBe(300000);
  });
});

describe('Sem Perfil pede o motivo', () => {
  it('sem motivo, ou "Outro" sem texto → 409 REASON_REQUIRED', async () => {
    const id = await create(lead({ nextContactAt: inDays(1) }));
    for (const partial of [
      {},
      { lostReason: 'OUTRO' },
      { lostReason: 'OUTRO', lostReasonOther: ' ' },
    ]) {
      const res = await h.patch(
        `/api/leads/${id}`,
        { version: 1, stageKey: 'PERDIDO', ...partial },
        ale,
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REASON_REQUIRED');
    }
    const ok = await h.patch(
      `/api/leads/${id}`,
      { version: 1, stageKey: 'PERDIDO', lostReason: 'OUTRO', lostReasonOther: 'Mudou de país' },
      ale,
    );
    expect(ok.status).toBe(200);
    // Sai do Hoje: próximo contato é apagado.
    expect(await get(id)).toMatchObject({
      lostReason: 'OUTRO',
      lostReasonOther: 'Mudou de país',
      nextContactAt: null,
    });
  });

  it('cadastro em Sem Perfil e texto descartado fora de "Outro"', async () => {
    expect((await h.post('/api/leads', lead({ stageKey: 'PERDIDO' }), ale)).body.code).toBe(
      'REASON_REQUIRED',
    );
    const id = await create(
      lead({ stageKey: 'PERDIDO', lostReason: 'SEM_RENDA', lostReasonOther: 'ignorado' }),
    );
    expect(await get(id)).toMatchObject({ lostReason: 'SEM_RENDA', lostReasonOther: null });
  });
});

describe('estado atual da etapa', () => {
  it('sair da etapa apaga pagamento e motivo', async () => {
    const id = await create(
      lead({
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(5),
        paymentProductId: productId,
        paymentAmountCents: 300000,
      }),
    );
    await h.patch(
      `/api/leads/${id}`,
      { version: 1, stageKey: 'PERDIDO', lostReason: 'SEM_INTERESSE' },
      ale,
    );
    expect(await get(id)).toMatchObject({
      paymentProductId: null,
      paymentAmountCents: null,
      lostReason: 'SEM_INTERESSE',
    });
    await h.patch(`/api/leads/${id}`, { version: 2, stageKey: 'EM_FOLLOW' }, ale);
    expect(await get(id)).toMatchObject({ lostReason: null, lostReasonOther: null });
  });

  it('dados de outra etapa são ignorados', async () => {
    const id = await create(
      lead({ lostReason: 'SEM_RENDA', paymentProductId: productId, paymentAmountCents: 1 }),
    );
    expect(await get(id)).toMatchObject({
      stageKey: 'SONDAGEM',
      lostReason: null,
      paymentProductId: null,
    });
  });

  it('lead que já está na etapa sem os dados fica como está (3A)', async () => {
    const id = await create(lead());
    await owner`update leads set stage_id = (select id from pipeline_stages where key = 'PERDIDO') where id = ${id}`;
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, summary: 'segue sem perfil' }, ale)).status,
    ).toBe(200);
    // Mesmo reenviando a etapa atual, não cobra: só a troca de etapa exige.
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 2, stageKey: 'PERDIDO' }, ale)).status,
    ).toBe(200);
  });

  it('na mesma etapa dá para corrigir o pagamento', async () => {
    const id = await create(
      lead({
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(5),
        paymentProductId: productId,
        paymentAmountCents: 300000,
      }),
    );
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, paymentAmountCents: 280000 }, ale)).status,
    ).toBe(200);
    expect((await get(id)).paymentAmountCents).toBe(280000);
  });

  it('registrar a venda tira o pagamento combinado', async () => {
    const [p] = await owner<
      { closer_id: string }[]
    >`select closer_id from products where id = ${productId}`;
    const id = await create(
      lead({
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(5),
        paymentProductId: productId,
        paymentAmountCents: 300000,
      }),
    );
    const res = await h.post(
      '/api/finance/deals',
      {
        leadId: id,
        productId,
        closerId: p!.closer_id,
        version: 1,
        totalCents: 300000,
        method: 'PIX',
        entryCents: 0,
        installments: [],
        requestKey: randomUUID(),
      },
      ronaldo,
    );
    expect(res.status).toBe(201);
    expect(await get(id, ronaldo)).toMatchObject({
      stageKey: 'VENDA',
      paymentProductId: null,
      paymentAmountCents: null,
    });
  });
});

describe('closer marca a etapa depois da reunião', () => {
  async function leadOnSoniaAgenda() {
    const id = await create(lead({ nextContactAt: inDays(1) }));
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${id}, ${ids.sonia}, now() - interval '1 hour', 'DIRETO', ${ids.ale})`;
    return id;
  }

  it('Agendou Pagamento e depois Sem Perfil, com os dados', async () => {
    const id = await leadOnSoniaAgenda();
    const pay = await h.patch(
      `/api/leads/${id}`,
      {
        version: 1,
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(4),
        paymentProductId: productId,
        paymentAmountCents: 500000,
      },
      sonia,
    );
    expect(pay.status).toBe(200);
    const lost = await h.patch(
      `/api/leads/${id}`,
      { version: 2, stageKey: 'PERDIDO', lostReason: 'NAO_RESPONDEU' },
      sonia,
    );
    expect(lost.status).toBe(200);
    expect(await get(id, sonia)).toMatchObject({
      stageKey: 'PERDIDO',
      lostReason: 'NAO_RESPONDEU',
      paymentProductId: null,
      nextContactAt: null,
    });
  });

  it('sem trocar a etapa continua sem editar; reunião nova não é do closer', async () => {
    const id = await leadOnSoniaAgenda();
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, nextContactAt: inDays(2) }, sonia)).status,
    ).toBe(403);
    expect(
      (
        await h.patch(
          `/api/leads/${id}`,
          { version: 1, stageKey: 'AGENDADO_DIRETO', meeting: meeting() },
          sonia,
        )
      ).status,
    ).toBe(403);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, stageKey: 'NO_SHOW', summary: 'x' }, sonia))
        .status,
    ).toBe(403);
  });
});

// Pagamento parcial (NPAC-41, Igor 06/11/2026, "1A"): o lead já deu uma entrada e o restante tem
// data combinada. Fica em Agendou Pagamento; só vira venda quando o closer registrar.
describe('Agendou Pagamento parcial', () => {
  const partial = (over: Record<string, unknown> = {}) =>
    lead({
      stageKey: 'AGENDOU_PAGAMENTO',
      nextContactAt: inDays(10),
      paymentProductId: productId,
      paymentAmountCents: 1_800_000,
      paymentEntryCents: 600_000,
      ...over,
    });

  it('grava a entrada no cadastro e devolve no lead; nada vira venda', async () => {
    const id = await create(partial());
    expect(await get(id)).toMatchObject({
      stageKey: 'AGENDOU_PAGAMENTO',
      paymentAmountCents: 1_800_000,
      paymentEntryCents: 600_000,
    });
    expect(await owner`select id from deals`).toHaveLength(0);
    expect(await owner`select id from payments`).toHaveLength(0);
  });

  it('entrada igual ou maior que o valor → 400 e nada gravado', async () => {
    for (const entry of [1_800_000, 2_000_000]) {
      const res = await h.post('/api/leads', partial({ paymentEntryCents: entry }), ale);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/entrada/i);
    }
    expect(await owner`select id from leads`).toHaveLength(0);
  });

  it('na mesma etapa dá para tirar a entrada; sair da etapa apaga', async () => {
    const id = await create(partial());
    const clear = await h.patch(`/api/leads/${id}`, { version: 1, paymentEntryCents: null }, ale);
    expect(clear.status).toBe(200);
    expect((await get(id)).paymentEntryCents).toBeNull();
    // A timeline só leva o nome do campo, nunca o valor.
    expect((await timeline(id)).at(-1)).toMatchObject({
      kind: 'lead.updated',
      fields: ['payment'],
    });

    const again = await h.patch(
      `/api/leads/${id}`,
      { version: 2, paymentEntryCents: 500_000 },
      ale,
    );
    expect(again.status).toBe(200);
    const out = await h.patch(`/api/leads/${id}`, { version: 3, stageKey: 'EM_FOLLOW' }, ale);
    expect(out.status).toBe(200);
    expect(await get(id)).toMatchObject({ paymentEntryCents: null, paymentAmountCents: null });
  });

  it('closer grava a entrada junto da troca; registrar a venda apaga', async () => {
    const id = await create(lead({ nextContactAt: inDays(1) }));
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${id}, ${ids.sonia}, now() - interval '1 hour', 'DIRETO', ${ids.ale})`;
    const [nacao] = await owner<{ id: string }[]>`
      select id from products where code = 'NACAO_PADRAO'`;
    const pay = await h.patch(
      `/api/leads/${id}`,
      {
        version: 1,
        stageKey: 'AGENDOU_PAGAMENTO',
        nextContactAt: inDays(4),
        paymentProductId: nacao!.id,
        paymentAmountCents: 300_000,
        paymentEntryCents: 100_000,
      },
      sonia,
    );
    expect(pay.status).toBe(200);
    expect((await get(id, sonia)).paymentEntryCents).toBe(100_000);

    const reg = await h.post(
      '/api/finance/deals',
      {
        leadId: id,
        productId: nacao!.id,
        closerId: ids.sonia,
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
      paymentEntryCents: null,
      paymentAmountCents: null,
    });
  });
});
