import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// NPAC-70 (migration 0084; Duda, "1A, 2C"): contato e anotação do Histórico da ficha saem só pelas funções
// mentoria_contato_excluir / mentoria_anotacao_excluir, e só para a Admin do Acompanhamento ou a Diretoria. O npac_app
// continua sem DELETE nas duas tabelas. O histórico grava o tipo e quem excluiu, sem o texto.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'ex-diretor';
const DUDA = 'ex-duda'; // Acompanhamento + Admin
const ACOMP = 'ex-acomp'; // Acompanhamento sem o selo
const OPERACAO = 'ex-operacao';

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

let insc: string;

const contato = async () => {
  const [c] = await owner<{ id: string }[]>`
    insert into mentoria_contatos (inscricao_id, feito_por, quando, canal, motivo)
    values (${insc}, ${ACOMP}, now() - interval '1 hour', 'REUNIAO', 'cifrado') returning id`;
  return c!.id;
};
const anotacao = async () => {
  const [a] = await owner<{ id: string }[]>`
    insert into mentoria_anotacoes (inscricao_id, autor_id, texto) values (${insc}, ${ACOMP}, 'cifrado')
    returning id`;
  return a!.id;
};
const historico = () =>
  owner<{ tipo: string; ator_id: string; campos: string[] }[]>`
    select tipo, ator_id, campos from mentoria_historico where inscricao_id = ${insc} order by quando`;

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'ex-%'`;
  await owner`delete from "user" where id like 'ex-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DIRETOR}, 'Diretor Ex', 'diretor@ex.test', 'DIRETOR', false, false),
      (${DUDA}, 'Duda Ex', 'duda@ex.test', 'ACOMPANHAMENTO', false, false),
      (${ACOMP}, 'Acomp Ex', 'acomp@ex.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op Ex', 'op@ex.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', true), (${ACOMP}, 'ACOMPANHAMENTO', false),
      (${OPERACAO}, 'OPERACAO', false)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', '2026-01-10', '2027-01-10', ${ACOMP}) returning id`;
  insc = i!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${insc}, 1, 'Mentorado Fictício X1', 'mentorado ficticio x1')`;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'ex-%'`;
  await owner`delete from "user" where id like 'ex-%'`;
  await closeTestConnections();
});

describe('excluir contato e anotação (NPAC-70)', () => {
  it('o npac_app continua sem DELETE nas duas tabelas', async () => {
    const c = await contato();
    const a = await anotacao();
    expect(
      (await pgError(q(DUDA, sql`delete from mentoria_contatos where id = ${c}::uuid`))).code,
    ).toBe('42501');
    expect(
      (await pgError(q(DUDA, sql`delete from mentoria_anotacoes where id = ${a}::uuid`))).code,
    ).toBe('42501');
  });

  it('quem vê mas não é Admin recebe 42501; registro inexistente, P0002', async () => {
    const c = await contato();
    const a = await anotacao();
    for (const u of [ACOMP, OPERACAO]) {
      expect((await pgError(q(u, sql`select mentoria_contato_excluir(${c}::uuid)`))).code).toBe(
        '42501',
      );
      expect((await pgError(q(u, sql`select mentoria_anotacao_excluir(${a}::uuid)`))).code).toBe(
        '42501',
      );
    }
    const outro = randomUUID();
    expect(
      (await pgError(q(DUDA, sql`select mentoria_contato_excluir(${outro}::uuid)`))).code,
    ).toBe('P0002');
    expect(
      (await pgError(q(DUDA, sql`select mentoria_anotacao_excluir(${outro}::uuid)`))).code,
    ).toBe('P0002');
    expect((await owner`select 1 from mentoria_contatos where id = ${c}`).length).toBe(1);
    expect((await owner`select 1 from mentoria_anotacoes where id = ${a}`).length).toBe(1);
    expect(await historico()).toEqual([]);
  });

  it('a Admin exclui o contato: some do último contato e o histórico grava só o tipo', async () => {
    const c = await contato();
    const ultimo = async () =>
      (
        await owner<{ u: Date | null }[]>`
          select max(quando) as u from mentoria_contatos where inscricao_id = ${insc}`
      )[0]!.u;
    expect(await ultimo()).not.toBeNull();
    await q(DUDA, sql`select mentoria_contato_excluir(${c}::uuid)`);
    expect((await owner`select 1 from mentoria_contatos where id = ${c}`).length).toBe(0);
    expect(await ultimo()).toBeNull();
    expect(await historico()).toEqual([{ tipo: 'contato.excluido', ator_id: DUDA, campos: [] }]);
  });

  it('a Diretoria exclui a anotação', async () => {
    const a = await anotacao();
    await q(DIRETOR, sql`select mentoria_anotacao_excluir(${a}::uuid)`);
    expect((await owner`select 1 from mentoria_anotacoes where id = ${a}`).length).toBe(0);
    expect(await historico()).toEqual([
      { tipo: 'anotacao.excluida', ator_id: DIRETOR, campos: [] },
    ]);
  });
});
