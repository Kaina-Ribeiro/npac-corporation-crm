import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// NPAC-56 (0077): a venda registrada pelo closer cria a inscrição no Acompanhamento pela função
// `mentoria_inscricao_da_venda`; o estorno a cancela (gatilho em deals) e a situação do pagamento
// vem das parcelas (`mentoria_status_financeiro`). O closer só executa a função: não lê o módulo.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const CLOSER = 'mv-closer';
const SDR = 'mv-sdr';
const DUDA = 'mv-duda'; // Acompanhamento + Admin
const NOME = 'Lead Fictício Venda';

async function pgError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error && e.cause instanceof Error ? e.cause : e;
    return err as { code?: string; message: string };
  }
  throw new Error('esperava erro');
}

const q = <T extends Record<string, unknown>>(id: string, s: ReturnType<typeof sql>) =>
  withUser(db, id, async (tx) => [...(await tx.execute<T>(s))]);
const id = async (p: Promise<unknown>) => ((await p) as { id: string }[])[0]!.id;

let rdv: string;
let semMentoria: string;
let lead: string;

/** Venda do closer, sem parcelas por padrão (à vista). */
const venda = async (produto = rdv, metodo = 'PIX') =>
  id(owner`insert into deals (lead_id, product_id, product_name, catalog_price_cents, closer_id,
      sdr_id, total_cents, method, request_key, request_hash, created_by, closed_at)
    values (${lead}, ${produto}, 'Mentoria RDV', 1800000, ${CLOSER}, ${SDR}, 1800000, ${metodo},
      gen_random_uuid(), 'h', ${CLOSER}, '2026-11-20T02:00:00Z') returning id`);

/** Chama a função como o closer, com o contato já "cifrado" (aqui, textos de teste). */
const criar = (deal: string, quem = CLOSER) =>
  q<{ id: string }>(
    quem,
    sql`select mentoria_inscricao_da_venda(${deal}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
      ${NOME}, 'lead ficticio venda', 'cifra-whats', 'idx-whats', 'cifra-email', 'idx-email',
      'lead.ficticio') as id`,
  ).then((r) => r[0]!.id);

const estornar = (deal: string) =>
  owner`update deals set reversed_at = now(), reversed_by = ${CLOSER}, version = version + 1
    where id = ${deal}`;

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'mv-%'`;
  await owner`delete from "user" where id like 'mv-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${CLOSER}, 'Closer Mv', 'closer@mv.test', 'CLOSER', false, true),
      (${SDR}, 'Sdr Mv', 'sdr@mv.test', 'SDR', true, false),
      (${DUDA}, 'Duda Mv', 'duda@mv.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${DUDA}, 'ACOMPANHAMENTO', true)`;
  const etapa = await id(owner`
    insert into pipeline_stages (key, label, position) values ('VENDA', 'Venda Fechada', 90)
    on conflict (key) do update set label = excluded.label returning id`);
  rdv = await id(owner`insert into products (code, name, closer_id, price_cents, mentoria)
    values ('MV_RDV', 'Mentoria RDV', ${CLOSER}, 1800000, 'RDV') returning id`);
  semMentoria = await id(owner`insert into products (code, name, closer_id, price_cents)
    values ('MV_NACAO', 'Nação', ${CLOSER}, 250000) returning id`);
  lead = await id(owner`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, closer_id, created_by, instagram)
    values (${NOME}, 'R8_15K', 'BIO', 'P1', ${etapa}, ${SDR}, ${CLOSER}, ${SDR}, 'lead.ficticio')
    returning id`);
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from audit_log where action like 'mentoria.%venda%' or action like 'mentoria.cancelada%'`;
  await owner`delete from payments where deal_id in (select id from deals where lead_id = ${lead})`;
  await owner`delete from deals where lead_id = ${lead}`;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from payments where deal_id in (select id from deals where lead_id = ${lead})`;
  await owner`delete from deals where lead_id = ${lead}`;
  await owner`delete from leads where id = ${lead}`;
  await owner`delete from products where code like 'MV_%'`;
  await owner`delete from mentoria_perfis where user_id like 'mv-%'`;
  await owner`delete from "user" where id like 'mv-%'`;
  await closeTestConnections();
});

describe('inscrição pela venda', () => {
  it('cria inscrição, pessoa e 6 etapas a partir da venda', async () => {
    const deal = await venda();
    const insc = await criar(deal);
    const [i] = await owner<
      {
        status: string;
        tipo: string;
        mentoria: string;
        deal_id: string;
        responsavel_id: string | null;
        data_compra: string;
        valor_centavos: number;
        forma_pagamento: string;
        criado_por: string;
      }[]
    >`select status, tipo, mentoria, deal_id, responsavel_id, to_char(data_compra, 'YYYY-MM-DD') as data_compra,
        valor_centavos::int, forma_pagamento, criado_por from mentoria_inscricoes where id = ${insc}`;
    expect(i).toEqual({
      status: 'ONBOARDING',
      tipo: 'INDIVIDUAL',
      mentoria: 'RDV',
      deal_id: deal,
      responsavel_id: null,
      // 02h UTC do dia 20 = 23h do dia 19 em Brasília.
      data_compra: '2026-11-19',
      valor_centavos: 1800000,
      forma_pagamento: 'Pix',
      criado_por: CLOSER,
    });
    const pessoas = await owner<
      { ordem: number; nome: string; whatsapp: string; email_idx: string; instagram: string }[]
    >`select ordem, nome, whatsapp, email_idx, instagram from mentoria_pessoas where inscricao_id = ${insc}`;
    expect(pessoas).toEqual([
      {
        ordem: 1,
        nome: NOME,
        whatsapp: 'cifra-whats',
        email_idx: 'idx-email',
        instagram: 'lead.ficticio',
      },
    ]);
    const etapas = await owner<{ etapa: string; status: string }[]>`
      select etapa, status from mentoria_onboarding_etapas where inscricao_id = ${insc} order by etapa`;
    expect(etapas).toHaveLength(6);
    expect(etapas.every((e) => e.status === 'PENDENTE')).toBe(true);
    const hist = await owner<{ tipo: string; campos: string[] }[]>`
      select tipo, campos from mentoria_historico where inscricao_id = ${insc}`;
    expect(hist).toEqual([{ tipo: 'inscricao.criada_pela_venda', campos: [] }]);
  });

  it('recusa venda estornada, já ligada, de outra pessoa e produto sem mentoria', async () => {
    const ligada = await venda();
    await criar(ligada);
    expect((await pgError(criar(ligada))).code).toBe('22023');
    await estornar(ligada);
    const estornada = await venda();
    await estornar(estornada);
    expect((await pgError(criar(estornada))).code).toBe('22023');
    const outra = await venda();
    expect((await pgError(criar(outra, DUDA))).code).toBe('22023');
    await estornar(outra);
    const nacao = await venda(semMentoria);
    expect((await pgError(criar(nacao))).code).toBe('22023');
    expect((await pgError(criar(randomUUID()))).code).toBe('22023');
  });

  it('closer executa a função mas não lê a inscrição', async () => {
    await criar(await venda());
    const [n] = await q<{ n: number }>(
      CLOSER,
      sql`select count(*)::int as n from mentoria_inscricoes`,
    );
    expect(n!.n).toBe(0);
    // Nem grava direto com a venda: só a função liga a venda à inscrição.
    expect(
      (
        await pgError(
          q(
            DUDA,
            sql`insert into mentoria_inscricoes (tipo, mentoria, deal_id)
              values ('INDIVIDUAL', 'RDV', ${randomUUID()}::uuid)`,
          ),
        )
      ).code,
    ).toBe('22023');
  });

  it('estorno cancela a inscrição e mantém reuniões e contatos', async () => {
    const deal = await venda();
    const insc = await criar(deal);
    await owner`update mentoria_inscricoes set status = 'ATIVO', responsavel_id = ${DUDA},
      inicio_jornada = '2026-11-20' where id = ${insc}`;
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${insc}, 'IDR', ${DUDA}, now() - interval '1 day')`;
    await owner`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal)
      values (${insc}, ${DUDA}, now(), 'WHATSAPP')`;
    const contar = async () =>
      (
        await owner<{ r: number; a: number }[]>`select
          (select count(*)::int from mentoria_reunioes where inscricao_id = ${insc}) as r,
          (select count(*)::int from mentoria_contatos where inscricao_id = ${insc}) as a`
      )[0];
    const antes = await contar();
    await estornar(deal);
    const [i] = await owner<{ status: string; version: number }[]>`
      select status, version from mentoria_inscricoes where id = ${insc}`;
    expect(i!.status).toBe('CANCELADO');
    expect(await contar()).toEqual(antes);
    const hist = await owner<{ tipo: string }[]>`
      select tipo from mentoria_historico where inscricao_id = ${insc} order by id`;
    expect(hist.map((h) => h.tipo)).toContain('inscricao.cancelada_pelo_estorno');
  });

  it('estorno de inscrição pausada fecha a pausa', async () => {
    const deal = await venda();
    const insc = await criar(deal);
    await owner`update mentoria_inscricoes set status = 'PAUSADO' where id = ${insc}`;
    await owner`insert into mentoria_pausas (inscricao_id, inicio, status_anterior)
      values (${insc}, '2026-11-01', 'ATIVO')`;
    await estornar(deal);
    const [p] = await owner<{ fim: string | null }[]>`
      select fim::text from mentoria_pausas where inscricao_id = ${insc}`;
    expect(p!.fim).not.toBeNull();
  });

  it('situação do pagamento segue as parcelas', async () => {
    const situacao = async (insc: string) =>
      (
        await q<{ s: string | null }>(
          DUDA,
          sql`select mentoria_status_financeiro(${insc}::uuid) as s`,
        )
      )[0]!.s;
    // À vista: sem parcela em aberto.
    const aVista = await criar(await venda());
    expect(await situacao(aVista)).toBe('QUITADO');
    await owner`truncate mentoria_inscricoes cascade`;
    await owner`delete from deals where lead_id = ${lead}`;

    const deal = await venda(rdv, 'BANK_SLIP');
    const insc = await criar(deal);
    await owner`insert into payments (deal_id, amount_cents, due_at) values
      (${deal}, 900000, now() + interval '10 days'), (${deal}, 900000, now() + interval '40 days')`;
    expect(await situacao(insc)).toBe('EM_DIA');
    await owner`update payments set due_at = now() - interval '1 hour'
      where deal_id = ${deal} and due_at < now() + interval '20 days'`;
    expect(await situacao(insc)).toBe('EM_ATRASO');
    await owner`update payments set paid_at = now(), paid_by = ${CLOSER}, receipt_key = gen_random_uuid()
      where deal_id = ${deal}`;
    expect(await situacao(insc)).toBe('QUITADO');
    // O closer não vê a inscrição: nada.
    expect(
      (
        await q<{ s: string | null }>(
          CLOSER,
          sql`select mentoria_status_financeiro(${insc}::uuid) as s`,
        )
      )[0]!.s,
    ).toBeNull();
    // Sem venda: a coluna gravada.
    const [manual] = await owner<{ id: string }[]>`
      insert into mentoria_inscricoes (tipo, mentoria, status_financeiro)
      values ('INDIVIDUAL', '2M', 'EM_ATRASO') returning id`;
    expect(await situacao(manual!.id)).toBe('EM_ATRASO');
  });

  it('recusa editar situação do pagamento de inscrição com venda', async () => {
    const insc = await criar(await venda());
    const e = await pgError(
      q(
        DUDA,
        sql`update mentoria_inscricoes set status_financeiro = 'EM_DIA' where id = ${insc}::uuid`,
      ),
    );
    expect(e.code).toBe('22023');
    expect(e.message).toContain('vem das parcelas');
  });

  it('grava auditoria da criação e do cancelamento sem nome nem e-mail', async () => {
    const deal = await venda();
    const insc = await criar(deal);
    await estornar(deal);
    const linhas = await owner<{ action: string; entity_id: string; texto: string }[]>`
      select action, entity_id, row_to_json(a)::text as texto from audit_log a
      where action in ('mentoria.inscricao_da_venda', 'mentoria.cancelada_pelo_estorno') order by id`;
    expect(linhas.map((l) => [l.action, l.entity_id])).toEqual([
      ['mentoria.inscricao_da_venda', insc],
      ['mentoria.cancelada_pelo_estorno', insc],
    ]);
    for (const l of linhas) {
      expect(l.texto).not.toContain('Fictício');
      expect(l.texto).not.toContain('cifra');
    }
  });
});
