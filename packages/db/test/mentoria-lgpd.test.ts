import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);
const ACOMP = 'ml-acomp';
const HEAD = 'ml-head';
const CASAL = 'Mentorado Fictício e Cônjuge Fictícia';

async function pgError(p: Promise<unknown>): Promise<{ code?: string }> {
  try {
    await p;
  } catch (e) {
    return (e instanceof Error && e.cause instanceof Error ? e.cause : e) as { code?: string };
  }
  throw new Error('esperava erro');
}
const como = (u: string, q: ReturnType<typeof sql>) =>
  withUser(db, u, async (tx) => (await tx.execute(q)) as unknown as Record<string, unknown>[]);

/** Procura um texto em toda coluna de texto de toda tabela do módulo. */
async function ondeAparece(textoProcurado: string): Promise<string[]> {
  const cols = await owner<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name like 'mentoria_%' and data_type = 'text'`;
  const achados: string[] = [];
  for (const c of cols) {
    const rows =
      await owner`select 1 from ${owner(c.table_name)} where ${owner(c.column_name)} ilike ${'%' + textoProcurado + '%'} limit 1`;
    if (rows.length) achados.push(`${c.table_name}.${c.column_name}`);
  }
  return achados;
}

beforeAll(async () => {
  await owner`delete from "user" where id in (${ACOMP}, ${HEAD})`;
  await owner`insert into "user" (id, name, email, role, can_prospect, can_close) values
    (${ACOMP}, 'Acomp ML', 'acomp@ml.test', 'ACOMPANHAMENTO', false, false),
    (${HEAD}, 'Head ML', 'head@ml.test', 'HEAD', false, false)`;
});
beforeEach(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia, mentoria_midia_exclusao cascade`;
});
afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia, mentoria_midia_exclusao cascade`;
  await owner`delete from "user" where id in (${ACOMP}, ${HEAD})`;
  await closeTestConnections();
});

describe('eliminação no acompanhamento', () => {
  it('eliminação do registro apaga o mentorado, os filhos e enfileira a mídia (reforça a Task 7)', async () => {
    const ficha = randomUUID();
    const conquista = randomUUID();
    await como(
      ACOMP,
      sql`insert into mentoria_fichas (id, nome, nome_norm) values (${ficha}, ${CASAL}, 'casal ficticio')`,
    );
    await owner`insert into mentoria_conquistas (id, ficha_id, descricao) values (${conquista}, ${ficha}, 'x')`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes) values
      ('CONQUISTA', ${conquista}, 'FOTO', 'k-c', 'image/jpeg', 1), ('FICHA_DEPOIS', ${ficha}, 'FOTO', 'k-d', 'image/jpeg', 1)`;
    const [r] = await como(ACOMP, sql`select mentoria_excluir_registro('FICHA', ${ficha}, 1) as n`);
    expect(r?.n).toBe(2);
    const fila = await owner<
      { chave_objeto: string }[]
    >`select chave_objeto from mentoria_midia_exclusao order by chave_objeto`;
    expect(fila.map((f) => f.chave_objeto)).toEqual(['k-c', 'k-d']);
  });

  it('nenhuma tabela do módulo guarda o nome original após a exclusão (varredura)', async () => {
    const ficha = randomUUID();
    await como(
      ACOMP,
      sql`insert into mentoria_fichas (id, nome, nome_norm) values (${ficha}, ${CASAL}, 'casal ficticio')`,
    );
    expect(await ondeAparece('Cônjuge Fictícia')).toEqual(['mentoria_fichas.nome']);
    await como(ACOMP, sql`select mentoria_excluir_registro('FICHA', ${ficha}, 1)`);
    expect(await ondeAparece('Cônjuge Fictícia')).toEqual([]);
    expect(await ondeAparece('casal ficticio')).toEqual([]);
  });

  it('registro do casal é um só: excluir remove os dois nomes e nenhum registro vizinho', async () => {
    const casal = randomUUID();
    const vizinho = randomUUID();
    await como(
      ACOMP,
      sql`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (${casal}, ${CASAL}, 'casal ficticio'), (${vizinho}, 'Mentorado Fictício 09', 'mentorado ficticio 09')`,
    );
    await como(ACOMP, sql`select mentoria_excluir_registro('RDV_PESSOA', ${casal}, 1)`);
    expect(await ondeAparece('Cônjuge')).toEqual([]);
    const [v] = await owner<
      { n: number }[]
    >`select count(*)::int as n from mentoria_rdv_pessoas where id = ${vizinho}`;
    expect(v?.n).toBe(1);
  });

  it('pessoa_ref liga a mesma pessoa nos três módulos pelo nome normalizado', async () => {
    await como(
      ACOMP,
      sql`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 07', 'mentorado ficticio 07', 'ENGAJADO')`,
    );
    await como(
      ACOMP,
      sql`insert into mentoria_fichas (id, nome, nome_norm) values (${randomUUID()}, 'Mentorado Fictício 07', 'mentorado ficticio 07')`,
    );
    await como(
      ACOMP,
      sql`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (${randomUUID()}, 'Mentorado FICTICIO 07', 'mentorado ficticio 07')`,
    );
    await como(
      ACOMP,
      sql`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (${randomUUID()}, 'Mentorado Fictício 08', 'mentorado ficticio 08')`,
    );
    const refs = await owner<{ pessoa_ref: string }[]>`
      select pessoa_ref from mentoria_mentorados where nome_norm = 'mentorado ficticio 07'
      union all select pessoa_ref from mentoria_fichas where nome_norm = 'mentorado ficticio 07'
      union all select pessoa_ref from mentoria_rdv_pessoas where nome_norm = 'mentorado ficticio 07'`;
    expect(refs).toHaveLength(3);
    expect(new Set(refs.map((r) => r.pessoa_ref)).size).toBe(1);
    const [outro] = await owner<
      { pessoa_ref: string }[]
    >`select pessoa_ref from mentoria_rdv_pessoas where nome_norm = 'mentorado ficticio 08'`;
    expect(outro?.pessoa_ref).not.toBe(refs[0]?.pessoa_ref);
  });

  it('excluir pessoa remove a mesma pessoa nos três módulos (D37) e enfileira a mídia', async () => {
    const ficha = randomUUID();
    const pessoa = randomUUID();
    await como(
      ACOMP,
      sql`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 07', 'mentorado ficticio 07', 'ENGAJADO')`,
    );
    await como(
      ACOMP,
      sql`insert into mentoria_fichas (id, nome, nome_norm) values (${ficha}, 'Mentorado Fictício 07', 'mentorado ficticio 07')`,
    );
    await como(
      ACOMP,
      sql`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (${pessoa}, 'Mentorado Fictício 07', 'mentorado ficticio 07'), (${randomUUID()}, 'Mentorado Fictício 08', 'mentorado ficticio 08')`,
    );
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes) values
      ('FICHA_ANTES', ${ficha}, 'FOTO', 'k-a', 'image/jpeg', 1), ('RDV_PESSOA', ${pessoa}, 'FOTO', 'k-p', 'image/jpeg', 1)`;
    const [ref] = await owner<
      { pessoa_ref: string }[]
    >`select pessoa_ref from mentoria_fichas where id = ${ficha}`;
    const [r] = await como(ACOMP, sql`select mentoria_excluir_pessoa(${ref!.pessoa_ref}) as n`);
    expect(r).toMatchObject({ n: { registros: 3, midias: 2 } });
    expect(await ondeAparece('Fictício 07')).toEqual([]);
    expect(await ondeAparece('Fictício 08')).toEqual(['mentoria_rdv_pessoas.nome']);
    const [f] = await owner<
      { n: number }[]
    >`select count(*)::int as n from mentoria_midia_exclusao`;
    expect(f?.n).toBe(2);
  });

  it('a função de exclusão recusa usuário sem papel (42501)', async () => {
    expect(
      (await pgError(como(HEAD, sql`select mentoria_excluir_pessoa(${randomUUID()})`))).code,
    ).toBe('42501');
    expect(
      (
        await pgError(
          como(HEAD, sql`select mentoria_excluir_registro('FICHA', ${randomUUID()}, 1)`),
        )
      ).code,
    ).toBe('42501');
  });

  it('npac_app não altera pessoa_ref', async () => {
    await como(
      ACOMP,
      sql`insert into mentoria_fichas (id, nome, nome_norm) values (${randomUUID()}, 'X', 'x')`,
    );
    expect(
      (await pgError(como(ACOMP, sql`update mentoria_fichas set pessoa_ref = gen_random_uuid()`)))
        .code,
    ).toBe('42501');
  });
});
