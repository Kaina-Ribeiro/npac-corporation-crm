import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// NPAC-75 (migration 0087; Duda, "1A, 2B" + S2): engajamento marcado à mão na ficha. Marcam Admin e Acompanhamento
// (com o recorte "só a carteira"); a Operação só vê; a Especialista não vê a coluna (`mentoria_ve_engajamento()`).
// Inscrição nova começa sem marcação, menos pelo dono do banco.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'eg-diretor';
const DUDA = 'eg-duda'; // Acompanhamento + Admin
const ACOMP = 'eg-acomp';
const CART = 'eg-cart'; // Acompanhamento "só a carteira"
const OPERACAO = 'eg-operacao';
const ESPEC = 'eg-espec';

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

const marcar = (u: string, id: string, valor: string | null) =>
  q<{ id: string }>(
    u,
    sql`update mentoria_inscricoes set engajamento = ${valor} where id = ${id}::uuid returning id`,
  );

const valor = async (id: string) =>
  (
    await owner<{ engajamento: string | null }[]>`
    select engajamento from mentoria_inscricoes where id = ${id}`
  )[0]?.engajamento;

let daCart: string; // responsável: CART
let daAcomp: string; // responsável: ACOMP, com reunião conduzida pela ESPEC

const nova = async (n: number, responsavel: string) => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', '2M', 'ATIVO', '2026-01-10', '2027-01-10', ${responsavel}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício E${n}`}, ${`mentorado ficticio e${n}`})`;
  return i!.id;
};

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'eg-%'`;
  await owner`delete from "user" where id like 'eg-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DIRETOR}, 'Diretor Eg', 'diretor@eg.test', 'DIRETOR', false, false),
      (${DUDA}, 'Duda Eg', 'duda@eg.test', 'ACOMPANHAMENTO', false, false),
      (${ACOMP}, 'Acomp Eg', 'acomp@eg.test', 'ACOMPANHAMENTO', false, false),
      (${CART}, 'Cart Eg', 'cart@eg.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op Eg', 'op@eg.test', 'ACOMPANHAMENTO', false, false),
      (${ESPEC}, 'Espec Eg', 'espec@eg.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', true), (${ACOMP}, 'ACOMPANHAMENTO', false),
      (${CART}, 'ACOMPANHAMENTO', false), (${OPERACAO}, 'OPERACAO', false),
      (${ESPEC}, 'ESPECIALISTA', false)`;
  await owner`update area_membros set alcance = 'CARTEIRA' where user_id = ${CART}`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  daCart = await nova(1, CART);
  daAcomp = await nova(2, ACOMP);
  await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
    values (${daAcomp}, 'POSICIONAMENTO', ${ESPEC}, now() - interval '2 hours')`;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'eg-%'`;
  await owner`delete from "user" where id like 'eg-%'`;
  await closeTestConnections();
});

describe('coluna', () => {
  it('aceita só os três valores ou nulo', async () => {
    const e = await pgError(
      owner`update mentoria_inscricoes set engajamento = 'OUTRO' where id = ${daCart}`,
    );
    expect(e.code).toBe('23514');
    await owner`update mentoria_inscricoes set engajamento = 'EM_RISCO' where id = ${daCart}`;
    expect(await valor(daCart)).toBe('EM_RISCO');
  });

  it('inscrição nova pelo app começa sem marcação', async () => {
    const [r] = await q<{ engajamento: string | null }>(
      DUDA,
      sql`insert into mentoria_inscricoes (tipo, mentoria, engajamento, responsavel_id)
        values ('INDIVIDUAL', 'RDV', 'ENGAJADO', ${ACOMP}) returning engajamento`,
    );
    expect(r?.engajamento).toBeNull();
  });
});

describe('quem marca', () => {
  it('Diretoria, Admin e Acompanhamento marcam e desmarcam', async () => {
    expect(await marcar(DIRETOR, daAcomp, 'ENGAJADO')).toHaveLength(1);
    expect(await marcar(DUDA, daAcomp, 'EM_ATENCAO')).toHaveLength(1);
    expect(await marcar(ACOMP, daAcomp, 'EM_RISCO')).toHaveLength(1);
    expect(await valor(daAcomp)).toBe('EM_RISCO');
    expect(await marcar(ACOMP, daAcomp, null)).toHaveLength(1);
    expect(await valor(daAcomp)).toBeNull();
  });

  it('"só a carteira" marca só a carteira dela', async () => {
    expect(await marcar(CART, daCart, 'ENGAJADO')).toHaveLength(1);
    // A de fora nem aparece para ela (RLS): nada muda.
    expect(await marcar(CART, daAcomp, 'ENGAJADO')).toHaveLength(0);
    expect(await valor(daAcomp)).toBeNull();
  });

  it('a Operação edita a inscrição, mas não o engajamento', async () => {
    await q(
      OPERACAO,
      sql`update mentoria_inscricoes set mentoria_variante = '2 encontros' where id = ${daAcomp}::uuid`,
    );
    const e = await pgError(marcar(OPERACAO, daAcomp, 'ENGAJADO'));
    expect(e.code).toBe('42501');
    expect(await valor(daAcomp)).toBeNull();
  });

  it('a Especialista não marca', async () => {
    const r = await marcar(ESPEC, daAcomp, 'ENGAJADO').catch((e: unknown) => e);
    expect(Array.isArray(r) ? r.length : 'erro').not.toBe(1);
    expect(await valor(daAcomp)).toBeNull();
  });
});

describe('quem vê', () => {
  const ve = (u: string) =>
    q<{ ve: boolean }>(u, sql`select mentoria_ve_engajamento() as ve`).then((r) => r[0]?.ve);

  it('Diretoria, Admin, Acompanhamento e Operação veem; a Especialista não', async () => {
    expect(await ve(DIRETOR)).toBe(true);
    expect(await ve(DUDA)).toBe(true);
    expect(await ve(ACOMP)).toBe(true);
    expect(await ve(CART)).toBe(true);
    expect(await ve(OPERACAO)).toBe(true);
    expect(await ve(ESPEC)).toBe(false);
  });

  it('"só a carteira" conta só a carteira (RLS da inscrição)', async () => {
    await owner`update mentoria_inscricoes set engajamento = 'ENGAJADO'`;
    const conta = (u: string) =>
      q<{ n: number }>(
        u,
        sql`select count(*)::int as n from mentoria_inscricoes where engajamento = 'ENGAJADO'`,
      ).then((r) => r[0]?.n);
    expect(await conta(CART)).toBe(1);
    expect(await conta(OPERACAO)).toBe(2);
    expect(await conta(DUDA)).toBe(2);
  });
});
