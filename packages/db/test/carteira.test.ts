// NPAC-54, Fase 3B (migration 0075): alcance "só a carteira" no cargo Acompanhamento. Quem tem alcance CARTEIRA vê e
// edita só as inscrições em que é responsável; cria só com ele de responsável; não troca o responsável; inscrição que
// sai da carteira some na hora. Alcance TODOS = como antes (rls-por-consulta e areas-equivalencia).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'c-diretor';
const DUDA = 'c-duda'; // Admin do Acompanhamento
const ACOMP = 'c-acomp'; // Acompanhamento, todos os mentorados
const CART = 'c-cart'; // Acompanhamento, só a carteira
const OPERACAO = 'c-operacao';

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

const alcance = async (u: string) =>
  (
    await owner<{ alcance: string }[]>`
    select alcance from area_membros where user_id = ${u} and area = 'ACOMPANHAMENTO'`
  )[0]?.alcance;

let minha: string; // inscrição da carteira da CART
let outra: string; // inscrição da ACOMP

const novaInscricao = async (n: number, responsavel: string) => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', '2026-01-10', '2027-01-10', ${responsavel}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício C${n}`}, ${`mentorado ficticio c${n}`})`;
  await owner`select mentoria_gerar_acoes(${i!.id}::uuid, '2026-01-01'::date)`;
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
    values (${i!.id}, 'POSICIONAMENTO', ${responsavel}, now() - interval '2 hours') returning id`;
  await owner`insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, descricao, prazo)
    values (${i!.id}, 'REUNIAO', ${r!.id}, 'cifrado', '2026-12-01')`;
  await owner`insert into mentoria_metas (inscricao_id, descricao) values (${i!.id}, 'cifrado')`;
  await owner`insert into mentoria_checkins (inscricao_id, enviado_em) values (${i!.id}, now())`;
  return i!.id;
};

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'c-%'`;
  await owner`delete from "user" where id like 'c-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DIRETOR}, 'Diretor C', 'diretor@c.test', 'DIRETOR', false, false),
      (${DUDA}, 'Duda C', 'duda@c.test', 'ACOMPANHAMENTO', false, false),
      (${ACOMP}, 'Acomp C', 'acomp@c.test', 'ACOMPANHAMENTO', false, false),
      (${CART}, 'Cart C', 'cart@c.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op C', 'op@c.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', true), (${ACOMP}, 'ACOMPANHAMENTO', false),
      (${CART}, 'ACOMPANHAMENTO', false), (${OPERACAO}, 'OPERACAO', false)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`update area_membros set alcance = 'CARTEIRA' where user_id = ${CART}`;
  minha = await novaInscricao(1, CART);
  outra = await novaInscricao(2, ACOMP);
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'c-%'`;
  await owner`delete from "user" where id like 'c-%'`;
  await closeTestConnections();
});

describe('gravar o alcance', () => {
  it('o Admin do Acompanhamento põe e tira "só a carteira" de quem tem o cargo Acompanhamento', async () => {
    await withUser(db, DUDA, (tx) =>
      tx.execute(
        sql`select area_definir_membro(${ACOMP}, 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', false, 'CARTEIRA')`,
      ),
    );
    expect(await alcance(ACOMP)).toBe('CARTEIRA');
    await withUser(db, DUDA, (tx) =>
      tx.execute(
        sql`select area_definir_membro(${ACOMP}, 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', false, 'TODOS')`,
      ),
    );
    expect(await alcance(ACOMP)).toBe('TODOS');
  });

  it('a versão de 4 argumentos (app anterior, mentoria_definir_perfil) mantém o alcance', async () => {
    await withUser(db, DUDA, (tx) =>
      tx.execute(
        sql`select area_definir_membro(${CART}, 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', false)`,
      ),
    );
    expect(await alcance(CART)).toBe('CARTEIRA');
  });

  it('trocar o cargo ou dar o selo volta a "todos"', async () => {
    await withUser(db, DUDA, (tx) =>
      tx.execute(sql`select area_definir_membro(${CART}, 'ACOMPANHAMENTO', 'OPERACAO', false)`),
    );
    expect(await alcance(CART)).toBe('TODOS');
    await owner`update area_membros set cargo = 'ACOMPANHAMENTO', alcance = 'CARTEIRA' where user_id = ${CART}`;
    await withUser(db, DIRETOR, (tx) =>
      tx.execute(
        sql`select area_definir_membro(${CART}, 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', true)`,
      ),
    );
    expect(await alcance(CART)).toBe('TODOS');
    await owner`update area_membros set head = false, alcance = 'CARTEIRA' where user_id = ${CART}`;
  });

  it('"só a carteira" vale só no cargo Acompanhamento, sem selo', async () => {
    const op = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(
          sql`select area_definir_membro(${OPERACAO}, 'ACOMPANHAMENTO', 'OPERACAO', false, 'CARTEIRA')`,
        ),
      ),
    );
    expect(op.code).toBe('22023');
    const selo = await pgError(
      withUser(db, DIRETOR, (tx) =>
        tx.execute(
          sql`select area_definir_membro(${ACOMP}, 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', true, 'CARTEIRA')`,
        ),
      ),
    );
    expect(selo.code).toBe('22023');
    const invalido = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(
          sql`select area_definir_membro(${ACOMP}, 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', false, 'METADE')`,
        ),
      ),
    );
    expect(invalido.code).toBe('22023');
    // Gravação direta (dono do banco) em quem não é do cargo: o gatilho volta a TODOS.
    await owner`update area_membros set alcance = 'CARTEIRA' where user_id = ${OPERACAO}`;
    expect(await alcance(OPERACAO)).toBe('TODOS');
  });

  it('ninguém muda o próprio alcance; quem não gerencia a área não muda', async () => {
    const proprio = await pgError(
      withUser(db, CART, (tx) =>
        tx.execute(
          sql`select area_definir_membro(${CART}, 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', false, 'TODOS')`,
        ),
      ),
    );
    expect(proprio.code).toBe('42501');
    const colega = await pgError(
      withUser(db, ACOMP, (tx) =>
        tx.execute(
          sql`select area_definir_membro(${CART}, 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', false, 'TODOS')`,
        ),
      ),
    );
    expect(colega.code).toBe('42501');
    expect(await alcance(CART)).toBe('CARTEIRA');
  });

  it('a conta mostra o alcance (area_conta_json)', async () => {
    const [r] = await owner<
      { j: { areas: { alcance: string }[] } }[]
    >`select area_conta_json(${CART}) as j`;
    expect(r!.j.areas[0]!.alcance).toBe('CARTEIRA');
  });
});

describe('o que "só a carteira" vê', () => {
  const conta = async (u: string, tabela: string) =>
    Number(
      (
        await q<{ n: string }>(u, sql`select count(*)::text as n from ${sql.identifier(tabela)}`)
      )[0]!.n,
    );

  it('só a carteira em cada tabela do módulo; o Acompanhamento com "todos" vê as duas', async () => {
    const tabelas = [
      'mentoria_inscricoes',
      'mentoria_pessoas',
      'mentoria_reunioes',
      'mentoria_tarefas',
      'mentoria_metas',
      'mentoria_checkins',
    ];
    for (const t of tabelas) {
      expect({ t, n: await conta(CART, t) }).toEqual({ t, n: 1 });
      expect({ t, n: await conta(ACOMP, t) }).toEqual({ t, n: 2 });
    }
    const acoesMinhas = await conta(CART, 'mentoria_acoes');
    const acoesTodas = await conta(ACOMP, 'mentoria_acoes');
    expect(acoesMinhas * 2).toBe(acoesTodas);
  });

  it('as funções por linha respondem pela carteira', async () => {
    const [r] = await q<{
      ve_minha: boolean;
      ve_outra: boolean;
      edita_outra: boolean;
      meta_outra: boolean;
    }>(
      CART,
      sql`select mentoria_ve(${minha}::uuid) as ve_minha, mentoria_ve(${outra}::uuid) as ve_outra,
        mentoria_edita('TAREFA', ${outra}::uuid) as edita_outra, mentoria_ve_meta(${outra}::uuid) as meta_outra`,
    );
    expect(r).toEqual({ ve_minha: true, ve_outra: false, edita_outra: false, meta_outra: false });
  });

  it('semáforo: só o da carteira (uma inscrição e o lote da Fila)', async () => {
    const um = await q<{ cor: string }>(
      CART,
      sql`select cor from mentoria_semaforo(${outra}::uuid, current_date)`,
    );
    expect(um).toHaveLength(0);
    const meu = await q<{ cor: string }>(
      CART,
      sql`select cor from mentoria_semaforo(${minha}::uuid, current_date)`,
    );
    expect(meu).toHaveLength(1);
    const lote = await q<{ inscricao_id: string }>(
      CART,
      sql`select inscricao_id from mentoria_semaforo_lote(current_date)`,
    );
    expect(lote.map((l) => l.inscricao_id)).toEqual([minha]);
  });

  it('inscrição que sai da carteira some na hora (d)', async () => {
    await owner`update mentoria_inscricoes set responsavel_id = ${ACOMP} where id = ${minha}`;
    expect(await conta(CART, 'mentoria_inscricoes')).toBe(0);
    expect(await conta(CART, 'mentoria_reunioes')).toBe(0);
    expect(await conta(CART, 'mentoria_metas')).toBe(0);
  });
});

describe('o que "só a carteira" edita', () => {
  it('edita a carteira, não a outra', async () => {
    const minhaN = await withUser(db, CART, (tx) =>
      tx.execute(sql`update mentoria_pessoas set apelido = 'X' where inscricao_id = ${minha}`),
    );
    expect(minhaN.count).toBe(1);
    // A outra nem aparece: o UPDATE não acha linha.
    const outraN = await withUser(db, CART, (tx) =>
      tx.execute(sql`update mentoria_pessoas set apelido = 'X' where inscricao_id = ${outra}`),
    );
    expect(outraN.count).toBe(0);
    const reuniao = await pgError(
      withUser(db, CART, (tx) =>
        tx.execute(sql`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
          values (${outra}, 'POSICIONAMENTO', ${CART}, now() + interval '1 day')`),
      ),
    );
    expect(reuniao.code).toBe('42501');
  });

  it('cadastra mentorado só com ela de responsável (2A)', async () => {
    // A API gera o id (sem RETURNING, como em inscricoes.service.ts) e lê depois.
    const id = crypto.randomUUID();
    await withUser(db, CART, (tx) =>
      tx.execute(sql`insert into mentoria_inscricoes (id, tipo, mentoria, status, responsavel_id)
        values (${id}, 'INDIVIDUAL', 'RDV', 'ONBOARDING', ${CART})`),
    );
    const lida = await q<{ id: string }>(
      CART,
      sql`select id from mentoria_inscricoes where id = ${id}`,
    );
    expect(lida).toHaveLength(1);
    const deOutra = await pgError(
      withUser(db, CART, (tx) =>
        tx.execute(sql`insert into mentoria_inscricoes (tipo, mentoria, status, responsavel_id)
          values ('INDIVIDUAL', 'RDV', 'ONBOARDING', ${ACOMP})`),
      ),
    );
    expect(deOutra.code).toBe('42501');
    const semResp = await pgError(
      withUser(db, CART, (tx) =>
        tx.execute(sql`insert into mentoria_inscricoes (tipo, mentoria, status)
          values ('INDIVIDUAL', 'RDV', 'ONBOARDING')`),
      ),
    );
    expect(semResp.code).toBe('42501');
  });

  it('não troca o responsável de um mentorado da carteira (e)', async () => {
    const e = await pgError(
      withUser(db, CART, (tx) =>
        tx.execute(
          sql`update mentoria_inscricoes set responsavel_id = ${ACOMP} where id = ${minha}`,
        ),
      ),
    );
    expect(e.code).toBe('42501');
    // Outros campos da própria inscrição continuam editáveis.
    const ok = await withUser(db, CART, (tx) =>
      tx.execute(
        sql`update mentoria_inscricoes set link_grupo = 'https://chat.whatsapp.com/teste' where id = ${minha}`,
      ),
    );
    expect(ok.count).toBe(1);
    // Quem tem "todos" troca, como antes.
    const acomp = await withUser(db, ACOMP, (tx) =>
      tx.execute(sql`update mentoria_inscricoes set responsavel_id = ${CART} where id = ${outra}`),
    );
    expect(acomp.count).toBe(1);
  });

  it('pausar e retomar fora da carteira: não encontrado', async () => {
    const e = await pgError(
      withUser(db, CART, (tx) =>
        tx.execute(sql`select mentoria_pausar(${outra}::uuid, gen_random_uuid(), 'cifrado')`),
      ),
    );
    expect(e.code).toBe('P0002');
    await withUser(db, CART, (tx) =>
      tx.execute(sql`select mentoria_pausar(${minha}::uuid, gen_random_uuid(), 'cifrado')`),
    );
    const r = await pgError(
      withUser(db, CART, (tx) => tx.execute(sql`select mentoria_retomar(${outra}::uuid)`)),
    );
    expect(r.code).toBe('P0002');
    await withUser(db, CART, (tx) => tx.execute(sql`select mentoria_retomar(${minha}::uuid)`));
  });

  it('excluir reunião agendada fora da carteira: não encontrado', async () => {
    const [r] = await owner<{ id: string }[]>`
      insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${outra}, 'ACOMP_2PME', ${ACOMP}, now() + interval '1 day') returning id`;
    const e = await pgError(
      withUser(db, CART, (tx) => tx.execute(sql`select mentoria_excluir_reuniao(${r!.id}::uuid)`)),
    );
    expect(e.code).toBe('P0002');
  });
});

describe('push "a todos do perfil"', () => {
  it('não vai a quem tem "só a carteira"; o item com ela de responsável vai a ela', async () => {
    const [r] = await owner<{ todos: string[]; dela: string[] }[]>`
      select mentoria_destinatarios('ACOMPANHAMENTO', null) as todos,
        mentoria_destinatarios('ACOMPANHAMENTO', ${CART}) as dela`;
    expect(r!.todos).toContain(ACOMP);
    expect(r!.todos).not.toContain(CART);
    expect(r!.dela).toEqual([CART]);
  });
});
