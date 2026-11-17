import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@npac/db';
import { DB } from '../src/common/db/db.module.js';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';
import { LegacyReportsService, legacyTeam, type ReportQuery } from './reports-legacy.js';
let app: NestFastifyApplication, h: ReturnType<typeof api>, ale: string, head: string;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, leads`;
  ale = await h.signIn('ale@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
  const murilo = await h.signIn('murilo@npac.com.br');
  await owner`update "user" set two_factor_enabled=true where email='ronaldo@npac.com.br'`;
  const [p] = await owner<
    { id: string; closer_id: string }[]
  >`select id,closer_id from products where code='NACAO_PROMO'`;
  for (const [cookie, insta, name, totalCents] of [
    [ale, '@rel.ale', '=SUM(1,1)', 250000],
    [murilo, '@rel.murilo', 'Outro lead', 300000],
  ] as const) {
    const lead = await h.post(
      '/api/leads',
      { name, instagram: insta, incomeBand: 'R8_15K', source: 'BIO' },
      cookie,
    );
    expect(
      (
        await h.post(
          '/api/finance/deals',
          {
            leadId: lead.body.id,
            productId: p!.id,
            closerId: p!.closer_id,
            version: 1,
            totalCents,
            method: 'PIX',
            requestKey: randomUUID(),
          },
          // Venda é registrada pelo closer ou pela liderança, não pelo SDR (04/11).
          head,
        )
      ).status,
    ).toBe(201);
    if (cookie === ale)
      await owner`insert into meetings (lead_id,closer_id,scheduled_at,origin,outcome,outcome_at,created_by)
   select ${lead.body.id},${p!.closer_id},now(),'DIRETO','DONE',now(),u.id from "user" u cross join generate_series(1,2) where u.email='ale@npac.com.br'`;
  }
});
it('produto renomeado continua em uma linha só, com o nome atual', async () => {
  const [p] = await owner<
    { id: string; name: string }[]
  >`select id,name from products where code='NACAO_PROMO'`;
  try {
    await owner`update products set name='Produto Renomeado' where id=${p!.id}`;
    const r = await h.post('/api/reports/search', { period: 'TODAY' }, head);
    expect(r.status).toBe(200);
    expect(r.body.byProduct).toHaveLength(1);
    expect(r.body.byProduct[0]).toMatchObject({ id: p!.id, name: 'Produto Renomeado' });
  } finally {
    await owner`update products set name=${p!.name} where id=${p!.id}`;
  }
});
it('SQL não duplica faturamento ao juntar duas reuniões e respeita escopo', async () => {
  const mine = await h.post('/api/reports/search', { period: 'TODAY' }, ale);
  expect(mine.status).toBe(200);
  expect(mine.body.bySdr[0]).toMatchObject({ p1: 1, direct: 2, follow: 0 });
  expect(mine.body.metrics).toMatchObject({ sales: 1, meetings: 2, done: 2 });
  // Valores de venda do SDR: só a liderança vê (filtrando pelo SDR).
  const aleId = (
    await owner<{ id: string }[]>`select id from "user" where email='ale@npac.com.br'`
  )[0]!.id;
  const asAle = await h.post('/api/reports/search', { period: 'TODAY', sdrId: aleId }, head);
  expect(asAle.body.byCloser[0].conversionBps).toBe(5000);
  expect(asAle.body.byProduct[0].ticketCents).toBe(250000);
  expect(asAle.body.metrics).toMatchObject({ soldCents: 250000, receivedCents: 250000 });
  expect(
    (await h.post('/api/reports/search', { period: 'TODAY' }, head)).body.metrics.soldCents,
  ).toBe(550000);
  const a = await h.post('/api/reports/search', { period: 'TODAY', page: 1, pageSize: 1 }, head);
  const b = await h.post('/api/reports/search', { period: 'TODAY', page: 2, pageSize: 1 }, head);
  expect(a.body.totalLeads).toBe(2);
  expect(a.body.leads).toHaveLength(1);
  expect(b.body.leads[0].id).not.toBe(a.body.leads[0].id);
  expect(b.body.metrics.soldCents).toBe(550000);
});
it('CSV só HEAD e neutraliza fórmula; resumo não inclui contato', async () => {
  expect((await h.post('/api/reports/csv', { period: 'TODAY' }, ale)).status).toBe(403);
  const csv = await h.post('/api/reports/csv', { period: 'TODAY' }, head);
  expect(csv.status).toBe(200);
  expect(csv.text).toContain("'=SUM(1,1)");
  const r = await h.post('/api/reports/summary', { period: 'TODAY' }, ale);
  expect(r.status).toBe(200);
  expect(r.body.text).not.toContain('rel.ale');
});
it('CSV leva o e-mail decifrado, com fórmula neutralizada', async () => {
  await h.post(
    '/api/leads',
    {
      name: 'Com e-mail',
      instagram: '@rel.email',
      email: '-rel@exemplo.com',
      incomeBand: 'R8_15K',
      source: 'BIO',
    },
    ale,
  );
  const csv = await h.post('/api/reports/csv', { period: 'TODAY' }, head);
  expect(csv.status).toBe(200);
  expect(csv.text.replace('\uFEFF', '').split('\r\n')[0]).toBe(
    '"Nome";"Telefone";"Instagram";"E-mail";"Perfil"',
  );
  expect(csv.text).toContain('"\'-rel@exemplo.com"');
});
it('exporta o relatório do período (números, sem contato); SDR sem valores de venda', async () => {
  const lead = await h.post('/api/reports/export', { period: 'TODAY' }, head);
  expect(lead.status).toBe(200);
  expect(lead.headers['content-type']).toContain('text/csv');
  expect(lead.headers['content-disposition']).toContain('npac-relatorio-periodo.csv');
  expect(lead.text).toContain('"Leads novos";"2"');
  expect(lead.text).toContain('"Vendido (R$)";"5500,00"');
  expect(lead.text).toContain('"Por SDR"');
  expect(lead.text).toContain('"Por closer"');
  expect(lead.text).toContain('"Por produto"');
  expect(lead.text).not.toContain('rel.ale');
  expect(lead.text).not.toContain('SUM(1,1)');

  const sdr = await h.post('/api/reports/export', { period: 'TODAY' }, ale);
  expect(sdr.status).toBe(200);
  expect(sdr.text).toContain('"Realizadas";"2"');
  expect(sdr.text).not.toContain('Vendido');
  expect(sdr.text).not.toContain('2500,00');
  expect(sdr.text).not.toContain('"Por produto"');

  const range = await h.post('/api/reports/export', { period: 'RANGE' }, head);
  expect(range.status).toBe(400);
  expect(range.headers['content-type']).not.toContain('text/csv');
});
it('leads excluídos não entram em métricas, linhas nem CSV do HEAD', async () => {
  const gone = await h.post(
    '/api/leads',
    {
      name: 'Lead excluído',
      instagram: '@rel.gone',
      // 15–50 mil = P0: o excluído não pode somar em p0.
      incomeBand: 'R15_50K',
      source: 'BIO',
    },
    ale,
  );
  expect(gone.status).toBe(201);
  await owner`update leads set deleted_at=now() where id=${gone.body.id}`;
  const r = await h.post('/api/reports/search', { period: 'TODAY' }, head);
  expect(r.body.metrics).toMatchObject({ leads: 2, p0: 0 });
  expect(r.body.leads.map((l: { id: string }) => l.id)).not.toContain(gone.body.id);
  const csv = await h.post('/api/reports/csv', { period: 'TODAY' }, head);
  expect(csv.text).not.toContain('rel.gone');
});

it('série diária do período fecha com as métricas e cobre todos os dias', async () => {
  const r = await h.post(
    '/api/reports/search',
    { period: 'RANGE', from: '2026-01-01', to: '2030-12-31' },
    head,
  );
  expect(r.status).toBe(400);
  const month = await h.post('/api/reports/search', { period: 'MONTH' }, head);
  const days: {
    date: string;
    leads: number;
    meetings: number;
    soldCents: number;
    receivedCents: number;
  }[] = month.body.daily;
  expect(days.length).toBeGreaterThanOrEqual(1);
  expect(days.at(-1)!.date).toBe(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
  );
  const sum = (k: 'leads' | 'meetings' | 'soldCents' | 'receivedCents') =>
    days.reduce((a, d) => a + d[k], 0);
  expect(sum('soldCents')).toBe(month.body.metrics.soldCents);
  expect(sum('receivedCents')).toBe(month.body.metrics.receivedCents);
  expect(sum('leads')).toBe(month.body.metrics.leads);
  expect(sum('meetings')).toBe(month.body.metrics.meetings);
  const aleId = (
    await owner<{ id: string }[]>`select id from "user" where email='ale@npac.com.br'`
  )[0]!.id;
  const mine = await h.post('/api/reports/search', { period: 'MONTH', sdrId: aleId }, head);
  expect(mine.body.daily.reduce((a: number, d: { soldCents: number }) => a + d.soldCents, 0)).toBe(
    250000,
  );
});

it('traz o período anterior de mesmo tamanho para comparar o faturamento', async () => {
  await owner`update deals set closed_at = (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month' + interval '12 hours') at time zone 'America/Sao_Paulo'
    where total_cents = 300000`;
  const r = await h.post('/api/reports/search', { period: 'MONTH' }, head);
  expect(r.body.previousDaily).toHaveLength(r.body.daily.length);
  const prev = r.body.previousDaily.reduce(
    (a: number, d: { soldCents: number }) => a + d.soldCents,
    0,
  );
  expect(prev).toBe(300000);
  expect(r.body.metrics.soldCents).toBe(250000);
  const mine = await h.post('/api/reports/search', { period: 'MONTH' }, ale);
  expect(
    mine.body.previousDaily.reduce((a: number, d: { soldCents: number }) => a + d.soldCents, 0),
  ).toBe(0);
});

it('atividade da equipe: só Head vê, mais recente primeiro, com quem fez e qual lead', async () => {
  expect((await h.get('/api/reports/activity', ale)).status).toBe(403);
  const r = await h.get('/api/reports/activity', head);
  expect(r.status).toBe(200);
  expect(r.body.items.length).toBeGreaterThan(0);
  expect(r.body.items.length).toBeLessThanOrEqual(8);
  const [first] = r.body.items;
  expect(first).toMatchObject({ kind: 'sale.registered', actorName: expect.any(String) });
  expect(first.leadName).toBe('Outro lead');
  const at = r.body.items.map((i: { at: string }) => i.at);
  expect([...at].sort().reverse()).toEqual(at);
  expect(Object.keys(first).sort()).toEqual(
    ['actorName', 'at', 'id', 'kind', 'leadId', 'leadName'].sort(),
  );
});

describe('comparecimento (pedido do cliente de 04/11)', () => {
  let aleId: string, muriloId: string, closerId: string;
  const ids: Record<string, string> = {};
  beforeEach(async () => {
    await owner`delete from meetings`;
    const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
    const by = (e: string) => users.find((u) => u.email === e)!.id;
    aleId = by('ale@npac.com.br');
    muriloId = by('murilo@npac.com.br');
    closerId = by('sonia@npac.com.br');
    // Perfil pela faixa: 15–50 mil = P0, 8–15 mil = P1, 5–8 mil = P2.
    for (const [key, incomeBand, outcome] of [
      ['p0done', 'R15_50K', 'DONE'],
      ['p1done', 'R8_15K', 'DONE'],
      ['p2noshow', 'R5_8K', 'NO_SHOW'],
      ['p0resched', 'R15_50K', 'RESCHEDULED'],
    ] as const) {
      const lead = await h.post(
        '/api/leads',
        {
          name: `Comp ${key}`,
          instagram: `@comp.${key}`,
          incomeBand,
          source: 'BIO',
        },
        ale,
      );
      ids[key] = lead.body.id;
      await owner`insert into meetings (lead_id,closer_id,scheduled_at,origin,outcome,outcome_at,created_by)
        values (${lead.body.id},${closerId},now() - interval '1 hour','DIRETO',${outcome},now(),${aleId})`;
    }
  });
  const today = (cookie: string, extra: object = {}) =>
    h.post('/api/reports/search', { period: 'TODAY', ...extra }, cookie);

  it('valor por reunião realizada soma só as realizadas', async () => {
    const r = await today(ale);
    expect(r.body.metrics).toMatchObject({
      meetingValueCents: 1600,
      done: 2,
      noShow: 1,
      rescheduled: 1,
    });
    const daily = r.body.daily.reduce(
      (a: number, d: { meetingValueCents: number }) => a + d.meetingValueCents,
      0,
    );
    expect(daily).toBe(1600);
  });

  it('resultado corrigido para no-show tira o valor', async () => {
    await owner`update meetings set outcome='NO_SHOW' where lead_id=${ids.p1done!}`;
    expect((await today(ale)).body.metrics.meetingValueCents).toBe(900);
  });

  it('perfil mudado depois (pela faixa) vale o atual', async () => {
    await owner`update leads set income_band='R5_8K' where id=${ids.p0done!}`;
    expect((await today(ale)).body.metrics.meetingValueCents).toBe(1200);
  });

  it('lead em "Descobrindo renda" não soma valor da reunião', async () => {
    await owner`update leads set income_band='DESCOBRINDO' where id=${ids.p0done!}`;
    const m = (await today(ale)).body.metrics;
    expect(m.meetingValueCents).toBe(700);
    expect(m.descobrindo).toBe(1);
  });

  it('liderança filtra o valor por SDR', async () => {
    expect((await today(head, { sdrId: muriloId })).body.metrics.meetingValueCents).toBe(0);
    expect((await today(head, { sdrId: aleId })).body.metrics.meetingValueCents).toBe(1600);
  });

  it('SDR não recebe valores de venda; liderança recebe', async () => {
    const r = await today(ale);
    for (const k of ['soldCents', 'receivedCents', 'outstandingCents', 'conversionBps'])
      expect(r.body.metrics).not.toHaveProperty(k);
    expect(r.body.byProduct).toEqual([]);
    expect(r.body.previousDaily).toEqual([]);
    expect(r.body.daily[0]).not.toHaveProperty('soldCents');
    expect(r.body.daily[0]).not.toHaveProperty('receivedCents');
    for (const row of [...r.body.bySdr, ...r.body.byCloser])
      expect(row).not.toHaveProperty('soldCents');
    const summary = await h.post('/api/reports/summary', { period: 'TODAY' }, ale);
    expect(summary.body.text).not.toMatch(/Vendido|Recebido|vendas do período/);
    expect(summary.body.text).toContain('Valor a receber por reunião realizada: R$');
    expect(summary.body.text).toContain('Reuniões realizadas: 2');
    expect((await today(head)).body.metrics).toHaveProperty('soldCents');
  });
});

describe('CSV de relatórios por período, filtro ou total', () => {
  it('total ignora a data de criação', async () => {
    await owner`update leads set created_at = now() - interval '2 years' where name = 'Outro lead'`;
    const month = await h.post('/api/reports/csv', { period: 'MONTH' }, head);
    expect(month.text).not.toContain('Outro lead');
    const all = await h.post('/api/reports/csv', { period: 'ALL' }, head);
    expect(all.status).toBe(200);
    expect(all.text).toContain('Outro lead');
    expect(all.text).toContain("'=SUM(1,1)");
  });

  it('com filtro respeita o SDR escolhido', async () => {
    const murilo = (
      await owner<{ id: string }[]>`select id from "user" where email='murilo@npac.com.br'`
    )[0]!.id;
    const r = await h.post('/api/reports/csv', { period: 'ALL', sdrId: murilo }, head);
    expect(r.text).toContain('Outro lead');
    expect(r.text).not.toContain('SUM(1,1)');
  });

  it('erro de validação do CSV responde 400 com a mensagem, não 500', async () => {
    const range = await h.post('/api/reports/csv', { period: 'RANGE' }, head);
    expect(range.status).toBe(400);
    expect(range.body.message).toBe('Intervalo inválido');
    const invalid = await h.post('/api/reports/csv', { period: 'ONTEM' }, head);
    expect(invalid.status).toBe(400);
  });

  it('busca da tela não aceita total', async () => {
    expect((await h.post('/api/reports/search', { period: 'ALL' }, head)).status).toBe(400);
  });
});

// T3.2 do plano de desempenho: a reescrita em menos consultas responde byte a byte igual à versão
// de antes (cópia congelada em reports-legacy.ts), com dados espalhados por este mês e o anterior.
describe('resposta idêntica à de antes da reescrita', () => {
  const ids: Record<string, string> = {};
  let products: { id: string; closer_id: string }[] = [];
  beforeEach(async () => {
    for (const u of await owner<
      { id: string; email: string }[]
    >`select id, email from "user" where email like '%@npac.com.br'`)
      ids[u.email.split('@')[0]!] = u.id;
    products = await owner`select id, closer_id from products order by code`;
    const sdrs = {
      ale,
      murilo: await h.signIn('murilo@npac.com.br'),
      igor: await h.signIn('igor@npac.com.br'),
    };
    const bands = ['R5_8K', 'R8_15K', 'R15_50K', 'R50K_PLUS', 'DESCOBRINDO'] as const;
    const sources = ['BIO', 'NACAO', 'YOUTUBE'] as const;
    const leads: { id: string; band: string }[] = [];
    let i = 0;
    for (const [sdr, cookie] of Object.entries(sdrs))
      for (const band of bands) {
        i++;
        const r = await h.post(
          '/api/leads',
          {
            name: `Equivalência ${i}`,
            instagram: `@eq.${sdr}.${i}`,
            incomeBand: band,
            source: sources[i % sources.length],
          },
          cookie,
        );
        expect(r.status, JSON.stringify(r.body)).toBe(201);
        leads.push({ id: r.body.id, band });
      }
    // Criação espalhada: hoje, este mês e o mês anterior (o MONTH compara com ele).
    for (const [k, l] of leads.entries())
      await owner`update leads set created_at = now() - make_interval(days => ${(k * 3) % 45}, hours => ${k % 7}) where id = ${l.id}`;
    // Reuniões de todo tipo: realizada, no-show, remarcada, aberta, cancelada, de outro closer.
    const outcomes = ['DONE', 'NO_SHOW', 'RESCHEDULED', null, 'DONE'] as const;
    for (const [k, l] of leads.entries()) {
      if (l.band === 'DESCOBRINDO') continue;
      for (let j = 0; j < 2; j++) {
        const outcome = outcomes[(k + j) % outcomes.length]!;
        const closer = (k + j) % 3 === 0 ? ids.sonia! : products[k % products.length]!.closer_id;
        const day = (k + j * 5) % 40;
        await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, outcome, outcome_at, canceled_at, created_by, created_at)
          values (${l.id}, ${closer}, now() - make_interval(days => ${day}),
            ${(k + j) % 2 ? 'FOLLOW' : 'DIRETO'}, ${outcome},
            case when ${outcome}::text is null then null else now() - make_interval(days => ${day}, hours => 1) end,
            case when ${(k + j) % 7 === 6} then now() end, ${ids.ale!},
            now() - make_interval(days => ${(k * 2 + j) % 38}))`;
      }
    }
    // Vendas: à vista e parcelada (parcela futura = a receber), datas recuadas, uma estornada.
    for (const [k, l] of leads.entries()) {
      if (k % 2 || l.band === 'DESCOBRINDO') continue;
      const p = products[k % products.length]!;
      const partial = k % 4 === 0;
      const total = 100000 + k * 1337;
      const r = await h.post(
        '/api/finance/deals',
        {
          leadId: l.id,
          productId: p.id,
          closerId: p.closer_id,
          version: 1,
          totalCents: total,
          method: partial ? 'PARTIAL' : 'PIX',
          entryCents: partial ? 40000 : 0,
          installments: partial
            ? [{ amountCents: total - 40000, dueAt: '2030-01-01T12:00:00-03:00' }]
            : [],
          requestKey: randomUUID(),
        },
        head,
      );
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const days = (k * 5) % 42;
      const hours = k % 5;
      await owner`update deals set closed_at = closed_at - make_interval(days => ${days}, hours => ${hours}) where lead_id = ${l.id}`;
      await owner`update payments set paid_at = paid_at - make_interval(days => ${days}, hours => ${hours})
        where paid_at is not null and deal_id in (select id from deals where lead_id = ${l.id})`;
      if (k % 6 === 2)
        await owner`update deals set reversed_at = now(), reversed_by = ${ids.ronaldo!} where lead_id = ${l.id}`;
    }
    // Uma venda no 1º dia do mês anterior: o "período anterior" do MONTH tem movimento em qualquer dia.
    await owner`update deals set closed_at = (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month' + interval '12 hours') at time zone 'America/Sao_Paulo'
      where total_cents = 300000`;
    // Lead excluído com reunião e venda: não entra em nada.
    await owner`update leads set deleted_at = now() where id = ${leads[4]!.id}`;
  });

  it('busca e equipe batem com a versão congelada para cada filtro e papel', async () => {
    const db = app.get<Db>(DB);
    const legacy = new LegacyReportsService(db);
    const promo = (
      await owner<{ id: string }[]>`select id from products where code='NACAO_PROMO'`
    )[0]!.id;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    );
    const from = new Date(Date.now() - 80 * 86_400_000).toISOString().slice(0, 10);
    const filters: ReportQuery[] = [
      { period: 'MONTH' },
      { period: 'MONTH', sdrId: ids.ale },
      { period: 'MONTH', closerId: products[0]!.closer_id, productId: promo },
      { period: 'TODAY' },
      { period: 'RANGE', from, to: today },
      { period: 'RANGE', from, to: today, closerId: ids.sonia },
      { period: 'RANGE', from, to: today, tier: 'P1', page: 2, pageSize: 3 },
      { period: 'RANGE', from, to: today, stage: 'SONDAGEM', source: 'BIO' },
    ];
    const people = [
      ['diretor', 'DIRETOR'],
      ['ronaldo', 'HEAD'],
      ['ale', 'SDR'],
      ['sonia', 'CLOSER'],
    ] as const;
    let compared = 0;
    for (const [who, role] of people) {
      const cookie = await h.signIn(`${who}@npac.com.br`);
      const u = { id: ids[who]!, role };
      for (const q of filters) {
        const res = await h.post('/api/reports/search', q, cookie);
        expect(res.status, `${who} ${JSON.stringify(q)}`).toBe(200);
        expect(res.text, `${who} ${JSON.stringify(q)}`).toBe(
          JSON.stringify(await legacy.search(u, q)),
        );
        compared++;
      }
      const team = await h.get('/api/team', cookie);
      expect(team.text, `${who} /team`).toBe(JSON.stringify(await legacyTeam(db, u)));
    }
    expect(compared).toBe(filters.length * people.length);
    // Os dados cobrem o que a reescrita precisa acertar (senão o teste passaria no vazio).
    const month = await legacy.search({ id: ids.diretor!, role: 'DIRETOR' }, { period: 'MONTH' });
    const m = month.metrics as Record<string, number>;
    for (const k of ['leads', 'meetings', 'done', 'noShow', 'sales', 'soldCents', 'receivedCents'])
      expect(m[k], k).toBeGreaterThan(0);
    expect(month.previousDaily.some((d) => Number(d.soldCents) > 0)).toBe(true);
  });
});
