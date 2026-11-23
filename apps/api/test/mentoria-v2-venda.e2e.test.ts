import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InscricaoDaVenda } from '../src/mentoria/venda/inscricao-da-venda.js';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// NPAC-56, Parte 1: a venda de RDV, 2M ou 6M registrada pelo closer vira mentorado no Acompanhamento
// na mesma transação (G9); o estorno cancela a inscrição (G5) e a situação do pagamento vem das
// parcelas (G6). A Fila mostra "Nova inscrição" à Admin (G4) e "Venda estornada" à responsável (M7).
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ids: Record<string, string>;
let ale: Cookie, sonia: Cookie, ronaldo: Cookie, duda: Cookie;
let produtoRdv: string, produtoNacao: string, rdvRonaldo: string;
let leadId: string;

const TELEFONE = '(11) 98765-4321';
const DIGITOS = '98765';
const ERRO =
  'Não foi possível criar o mentorado no Acompanhamento. Tente de novo; se continuar, avise a liderança.';
const DAY = 86_400_000;

const venda = (over: Record<string, unknown> = {}) => ({
  leadId,
  productId: produtoRdv,
  closerId: ids.sonia,
  version: 1,
  totalCents: 1_800_000,
  method: 'PIX',
  entryCents: 0,
  installments: [],
  requestKey: randomUUID(),
  ...over,
});

const inscricoesDoLead = () =>
  owner<{ id: string; deal_id: string; status: string; version: number }[]>`
    select i.id, i.deal_id, i.status, i.version from mentoria_inscricoes i
    join deals d on d.id = i.deal_id where d.lead_id = ${leadId}`;

const fila = async (cookie: Cookie, escopo: 'MINHA' | 'EQUIPE' = 'MINHA') => {
  const res = await h.post('/api/mentoria/fila', { escopo }, cookie);
  expect(res.status).toBe(200);
  return res.body.itens as {
    chave: string;
    tipo: string;
    inscricaoId: string;
    mentorado: { nome: string } | null;
    jaTem?: { inscricaoId: string; mentoria: string; status: string } | null;
  }[];
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
  await owner`delete from products where code like 'TESTE_V56_%'`;
  produtoRdv = (
    await owner<{ id: string }[]>`
      insert into products (code, name, closer_id, price_cents, mentoria)
      values ('TESTE_V56_RDV', 'Mentoria RDV da Sônia', ${ids.sonia!}, 1800000, 'RDV') returning id`
  )[0]!.id;
  produtoNacao = (
    await owner<{ id: string }[]>`select id from products where code = 'NACAO_PADRAO'`
  )[0]!.id;
  rdvRonaldo = (await owner<{ id: string }[]>`select id from products where code = 'RDV'`)[0]!.id;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes, mentoria_fila_feitos, mentoria_avisos_enviados cascade`;
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, sdr_sale_marks, leads`;
  await owner`delete from products where code like 'TESTE_V56_%'`;
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  await closeTestApp(app);
});

beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes, mentoria_fila_feitos, mentoria_avisos_enviados cascade`;
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, sdr_sale_marks, leads`;
  ale = await h.signIn('ale@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  ronaldo = await h.signIn('ronaldo@npac.com.br');
  // A Admin do Acompanhamento: a Carla com o perfil e o selo (o seed da API não tem a Duda).
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${ids.carla!}, 'ACOMPANHAMENTO', true)`;
  duda = await h.signIn('carla@npac.com.br');
  const res = await h.post(
    '/api/leads',
    {
      name: 'Joana Compradora',
      phone: TELEFONE,
      email: 'Joana.Compradora@exemplo.test',
      instagram: '@joana.compradora',
      incomeBand: 'R8_15K',
      source: 'BIO',
    },
    ale,
  );
  expect(res.status).toBe(201);
  leadId = res.body.id;
  // O closer enxerga o lead pela reunião (pedido do cliente, 04/11).
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, outcome, outcome_at)
    values (${leadId}, ${ids.sonia!}, now() - interval '1 day', 'DIRETO', ${ids.ale!}, 'DONE', now() - interval '1 day')`;
});

afterEach(() => vi.restoreAllMocks());

describe('venda vira mentorado', () => {
  it('venda de RDV pelo closer cria a inscrição com o contato do lead', async () => {
    const res = await h.post('/api/finance/deals', venda(), sonia);
    expect(res.status).toBe(201);
    const [i] = await inscricoesDoLead();
    expect(i).toMatchObject({ deal_id: res.body.id, status: 'ONBOARDING' });
    const ficha = await h.get(`/api/mentoria/inscricoes/${i!.id}`, duda);
    expect(ficha.status).toBe(200);
    expect(ficha.body).toMatchObject({
      nome: 'Joana Compradora',
      mentoria: 'RDV',
      tipo: 'INDIVIDUAL',
      status: 'ONBOARDING',
      valorCentavos: 1_800_000,
      formaPagamento: 'Pix',
      responsavelId: null,
      dealId: res.body.id,
      statusFinanceiro: 'QUITADO',
    });
    expect(ficha.body.pessoas[0]).toMatchObject({
      nome: 'Joana Compradora',
      whatsapp: '+5511987654321',
      email: 'joana.compradora@exemplo.test',
      instagram: 'joana.compradora',
    });
    expect(ficha.body.onboarding).toHaveLength(6);
  });

  it('venda de produto sem mentoria não cria inscrição', async () => {
    const res = await h.post(
      '/api/finance/deals',
      venda({ productId: produtoNacao, totalCents: 300_000 }),
      sonia,
    );
    expect(res.status).toBe(201);
    expect(await inscricoesDoLead()).toHaveLength(0);
  });

  it('mesmo requestKey duas vezes cria uma inscrição só', async () => {
    const input = venda();
    const a = await h.post('/api/finance/deals', input, sonia);
    const b = await h.post('/api/finance/deals', input, sonia);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(await inscricoesDoLead()).toHaveLength(1);
  });

  it('falha na criação desfaz a venda', async () => {
    vi.spyOn(InscricaoDaVenda.prototype, 'criar').mockRejectedValue(
      new (await import('@nestjs/common')).ConflictException(ERRO),
    );
    const res = await h.post('/api/finance/deals', venda(), sonia);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(ERRO);
    expect(await owner`select id from deals where lead_id = ${leadId}`).toHaveLength(0);
    expect(await owner`select id from mentoria_inscricoes`).toHaveLength(0);
    expect((await h.get(`/api/leads/${leadId}`, ale)).body.stageKey).not.toBe('VENDA');
  });

  it('erro do banco na criação vira o texto da venda e nada fica gravado', async () => {
    // Inscrição já ligada à venda que vai nascer: impossível; força a recusa do banco pelo índice.
    await owner`alter table mentoria_pessoas add constraint teste_v56_nome check (nome <> 'Joana Compradora')`;
    try {
      const res = await h.post('/api/finance/deals', venda(), sonia);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(ERRO);
      expect(await owner`select id from deals where lead_id = ${leadId}`).toHaveLength(0);
    } finally {
      await owner`alter table mentoria_pessoas drop constraint teste_v56_nome`;
    }
  });

  it('cadastro em Venda Fechada com a venda registrada cria a inscrição', async () => {
    const res = await h.post(
      '/api/leads',
      {
        name: 'Carlos Cadastro',
        instagram: '@carlos.cadastro',
        incomeBand: 'R8_15K',
        source: 'BIO',
        stageKey: 'VENDA',
        sdrId: ids.ale,
        soldProductId: rdvRonaldo,
        meeting: {
          scheduledAt: new Date(Date.now() - 3 * DAY).toISOString(),
          closerId: ids.ronaldo,
        },
        sale: {
          closedOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
            new Date(Date.now() - 2 * DAY),
          ),
          productId: rdvRonaldo,
          method: 'CARD',
          totalCents: 1_800_000,
          entryCents: 0,
          installments: [],
          requestKey: randomUUID(),
        },
      },
      ronaldo,
    );
    expect(res.status).toBe(201);
    const linhas = await owner<{ nome: string; forma: string; mentoria: string }[]>`
      select p.nome, i.forma_pagamento as forma, i.mentoria from mentoria_inscricoes i
      join mentoria_pessoas p on p.inscricao_id = i.id
      join deals d on d.id = i.deal_id where d.lead_id = ${res.body.id}`;
    expect(linhas).toEqual([{ nome: 'Carlos Cadastro', forma: 'Cartão', mentoria: 'RDV' }]);
  });

  it('estorno deixa a inscrição Cancelada', async () => {
    const res = await h.post('/api/finance/deals', venda(), sonia);
    const rev = await h.post(`/api/finance/deals/${res.body.id}/reverse`, { version: 1 }, ronaldo);
    expect(rev.status).toBe(200);
    const [i] = await inscricoesDoLead();
    expect(i!.status).toBe('CANCELADO');
    const ficha = await h.get(`/api/mentoria/inscricoes/${i!.id}`, duda);
    expect(ficha.body.status).toBe('CANCELADO');
  });

  it('situação do pagamento segue as parcelas e não se edita', async () => {
    const res = await h.post(
      '/api/finance/deals',
      venda({
        method: 'BANK_SLIP',
        installments: [
          { amountCents: 900_000, dueAt: new Date(Date.now() + 10 * DAY).toISOString() },
          { amountCents: 900_000, dueAt: new Date(Date.now() + 40 * DAY).toISOString() },
        ],
      }),
      sonia,
    );
    expect(res.status).toBe(201);
    const [i] = await inscricoesDoLead();
    const ler = async () => (await h.get(`/api/mentoria/inscricoes/${i!.id}`, duda)).body;
    expect((await ler()).statusFinanceiro).toBe('EM_DIA');
    expect((await ler()).formaPagamento).toBe('Boleto');
    await owner`update payments set due_at = now() - interval '1 hour'
      where deal_id = ${res.body.id} and due_at < now() + interval '20 days'`;
    expect((await ler()).statusFinanceiro).toBe('EM_ATRASO');
    const patch = await h.patch(
      `/api/mentoria/inscricoes/${i!.id}`,
      { version: (await ler()).version, statusFinanceiro: 'EM_DIA' },
      duda,
    );
    expect(patch.status).toBe(400);
    expect(patch.body.message).toMatch(/parcelas do comercial/);
  });

  it('closer recebe 404 na ficha que a venda criou', async () => {
    await h.post('/api/finance/deals', venda(), sonia);
    const [i] = await inscricoesDoLead();
    expect((await h.get(`/api/mentoria/inscricoes/${i!.id}`, sonia)).status).toBe(404);
  });

  it('nenhum log com o telefone do lead', async () => {
    const chamadas: unknown[][] = [];
    const guardar =
      (orig: (...a: unknown[]) => unknown) =>
      (...a: unknown[]) => {
        chamadas.push(a);
        return orig(...a);
      };
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const)
      vi.spyOn(Logger.prototype, m).mockImplementation(guardar(() => undefined));
    for (const m of ['log', 'warn', 'error', 'info'] as const)
      vi.spyOn(console, m).mockImplementation(guardar(() => undefined));
    // Inclui o caminho da falha, que é o que loga.
    await owner`alter table mentoria_pessoas add constraint teste_v56_nome check (nome <> 'Joana Compradora')`;
    try {
      await h.post('/api/finance/deals', venda(), sonia);
    } finally {
      await owner`alter table mentoria_pessoas drop constraint teste_v56_nome`;
    }
    await h.post('/api/finance/deals', venda(), sonia);
    const texto = JSON.stringify(chamadas);
    expect(texto).not.toContain(DIGITOS);
    expect(texto).not.toContain('Joana');
    expect(texto.toLowerCase()).not.toContain('exemplo.test');
  });
});

describe('Fila: nova inscrição e venda estornada', () => {
  it('Admin vê "Nova inscrição"; ganhar responsável tira o item; o estorno avisa a responsável', async () => {
    const res = await h.post('/api/finance/deals', venda(), sonia);
    const [i] = await inscricoesDoLead();
    const nova = (await fila(duda)).find((x) => x.tipo === 'NOVA_INSCRICAO');
    expect(nova).toMatchObject({
      chave: `nova-inscricao:${i!.id}`,
      inscricaoId: i!.id,
      mentorado: { nome: 'Joana Compradora' },
      jaTem: null,
    });
    // Quem não é Admin não recebe o item, nem na Minha fila nem na Equipe.
    await owner`update mentoria_perfis set admin = false where user_id = ${ids.carla!}`;
    try {
      expect((await fila(duda)).some((x) => x.tipo === 'NOVA_INSCRICAO')).toBe(false);
      expect((await fila(duda, 'EQUIPE')).some((x) => x.tipo === 'NOVA_INSCRICAO')).toBe(false);
    } finally {
      await owner`update mentoria_perfis set admin = true where user_id = ${ids.carla!}`;
    }

    const ficha = (await h.get(`/api/mentoria/inscricoes/${i!.id}`, duda)).body;
    const patch = await h.patch(
      `/api/mentoria/inscricoes/${i!.id}`,
      { version: ficha.version, responsavelId: ids.carla },
      duda,
    );
    expect(patch.status).toBe(200);
    expect((await fila(duda, 'EQUIPE')).some((x) => x.tipo === 'NOVA_INSCRICAO')).toBe(false);

    await h.post(`/api/finance/deals/${res.body.id}/reverse`, { version: 1 }, ronaldo);
    const estornada = (await fila(duda)).find((x) => x.tipo === 'VENDA_ESTORNADA');
    expect(estornada).toMatchObject({
      chave: `venda-estornada:${i!.id}`,
      mentorado: { nome: 'Joana Compradora' },
    });
    const visto = await h.post('/api/mentoria/fila/feito', { chave: estornada!.chave }, duda);
    expect(visto.status).toBe(204);
    expect((await fila(duda, 'EQUIPE')).some((x) => x.tipo === 'VENDA_ESTORNADA')).toBe(false);
  });

  it('"Nova inscrição" avisa quando a pessoa já tem inscrição', async () => {
    await h.post('/api/finance/deals', venda(), sonia);
    const [primeira] = await inscricoesDoLead();
    await owner`update mentoria_inscricoes set status = 'ATIVO', responsavel_id = ${ids.carla!}
      where id = ${primeira!.id}`;
    // Estorna e vende de novo (2M depois do RDV, M3): outra inscrição para a mesma pessoa.
    await owner`update deals set reversed_at = now(), reversed_by = ${ids.ronaldo!}, version = version + 1
      where lead_id = ${leadId}`;
    await owner`update mentoria_inscricoes set status = 'ATIVO' where id = ${primeira!.id}`;
    const lead = (await h.get(`/api/leads/${leadId}`, ale)).body;
    const res = await h.post('/api/finance/deals', venda({ version: lead.version }), sonia);
    expect(res.status).toBe(201);
    const nova = (await fila(duda)).find((x) => x.tipo === 'NOVA_INSCRICAO');
    expect(nova!.inscricaoId).not.toBe(primeira!.id);
    expect(nova!.jaTem).toEqual({ inscricaoId: primeira!.id, mentoria: 'RDV', status: 'ATIVO' });
  });
});
