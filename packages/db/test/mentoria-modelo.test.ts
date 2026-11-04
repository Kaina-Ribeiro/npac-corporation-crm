import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);
const ACOMP = 'mm-acomp';

let ficha: string;
let pessoa: string;

/** O drizzle embrulha o erro do Postgres; expõe o original. */
async function pgError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error && e.cause instanceof Error ? e.cause : e;
    return err as { code?: string; message: string };
  }
  throw new Error('esperava erro');
}

const comoApp = (q: ReturnType<typeof sql>) => withUser(db, ACOMP, (tx) => tx.execute(q));
const codigo = async (q: ReturnType<typeof sql>) => (await pgError(comoApp(q))).code;

beforeAll(async () => {
  await owner`delete from "user" where id = ${ACOMP}`;
  await owner`insert into "user" (id, name, email, role, can_prospect, can_close)
    values (${ACOMP}, 'Acomp MM', 'acomp@mm.test', 'ACOMPANHAMENTO', false, false)`;
});
beforeEach(async () => {
  await owner`truncate mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia, mentoria_midia_exclusao cascade`;
  ficha = randomUUID();
  pessoa = randomUUID();
  await comoApp(
    sql`insert into mentoria_fichas (id, nome, nome_norm) values (${ficha}, 'Mentorado Fictício 01', 'mentorado ficticio 01')`,
  );
  await comoApp(
    sql`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (${pessoa}, 'Mentorado Fictício 02', 'mentorado ficticio 02')`,
  );
});
afterAll(async () => {
  await owner`truncate mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia, mentoria_midia_exclusao cascade`;
  await owner`delete from "user" where id = ${ACOMP}`;
  await closeTestConnections();
});

describe('modelo do acompanhamento', () => {
  it('controle: ACOMPANHAMENTO grava ficha, campo, conquista, evento, quadro, dúvida e mídia', async () => {
    await comoApp(
      sql`insert into mentoria_ficha_campos (ficha_id, secao, chave, antes) values (${ficha}, 'PILAR', 'FE', 'x')`,
    );
    await comoApp(
      sql`insert into mentoria_conquistas (id, ficha_id, data_texto, descricao) values (${randomUUID()}, ${ficha}, '03/2026', 'x')`,
    );
    await comoApp(
      sql`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, data, descricao, origem, checklist_item) values (${randomUUID()}, ${pessoa}, '01/03/2026', '2026-03-01', 'x', 'MANUAL', 5)`,
    );
    await comoApp(
      sql`insert into mentoria_rdv_quadros (id, pessoa_id, quadro, descricao) values (${randomUUID()}, ${pessoa}, 'IMOVEL_LEILAO', 'x')`,
    );
    await comoApp(
      sql`insert into mentoria_rdv_duvidas (id, pessoa_id, texto) values (${randomUUID()}, ${pessoa}, 'x')`,
    );
    await comoApp(
      sql`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes) values ('CONQUISTA', ${ficha}, 'FOTO', ${randomUUID()}, 'image/jpeg', 20971520)`,
    );
    await comoApp(
      sql`insert into mentoria_midia (dono_tipo, dono_id, tipo, url_video) values ('RDV_EVENTO', ${pessoa}, 'LINK_VIDEO', 'https://www.youtube.com/watch?v=abc')`,
    );
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_midia`;
    expect(n?.n).toBe(2);
  });

  it('status fora da lista é recusado', async () => {
    expect(
      await codigo(
        sql`insert into mentoria_mentorados (nome, nome_norm, status) values ('X', 'x-st', 'ESFRIANDO')`,
      ),
    ).toBe('23514');
    expect(
      await codigo(
        sql`insert into mentoria_rdv_duvidas (id, pessoa_id, texto, status) values (${randomUUID()}, ${pessoa}, 'x', 'OUTRO')`,
      ),
    ).toBe('23514');
  });

  it('checklist_item 0 e 10 são recusados', async () => {
    for (const item of [0, 10])
      expect(
        await codigo(
          sql`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, data, descricao, origem, checklist_item) values (${randomUUID()}, ${pessoa}, '01/03/2026', '2026-03-01', 'x', 'MANUAL', ${item})`,
        ),
      ).toBe('23514');
  });

  it('chave de evolução fora das 5 é recusada', async () => {
    expect(
      await codigo(
        sql`insert into mentoria_ficha_campos (ficha_id, secao, chave) values (${ficha}, 'EVOLUCAO', 'FE')`,
      ),
    ).toBe('23514');
    expect(
      await codigo(
        sql`insert into mentoria_ficha_campos (ficha_id, secao, chave) values (${ficha}, 'EVOLUCAO', 'OUTRA')`,
      ),
    ).toBe('23514');
  });

  it('evento exige data (regra 4) e origem conhecida', async () => {
    expect(
      await codigo(
        sql`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, descricao, origem) values (${randomUUID()}, ${pessoa}, 'sem data', 'x', 'MANUAL')`,
      ),
    ).toBe('23502');
    expect(
      await codigo(
        sql`insert into mentoria_rdv_eventos (id, pessoa_id, data_texto, data, descricao, origem) values (${randomUUID()}, ${pessoa}, '01/03/2026', '2026-03-01', 'x', 'WHATSAPP')`,
      ),
    ).toBe('23514');
  });

  it('dúvida ABERTA com resolvida_em preenchido é recusada', async () => {
    expect(
      await codigo(
        sql`insert into mentoria_rdv_duvidas (id, pessoa_id, texto, status, resolvida_em) values (${randomUUID()}, ${pessoa}, 'x', 'ABERTA', now())`,
      ),
    ).toBe('23514');
  });

  it('mídia LINK_VIDEO sem url_video é recusada', async () => {
    expect(
      await codigo(
        sql`insert into mentoria_midia (dono_tipo, dono_id, tipo) values ('RDV_EVENTO', ${pessoa}, 'LINK_VIDEO')`,
      ),
    ).toBe('23514');
  });

  it('mídia de 20 MB + 1 byte é recusada', async () => {
    expect(
      await codigo(
        sql`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes) values ('CONQUISTA', ${ficha}, 'FOTO', ${randomUUID()}, 'image/jpeg', 20971521)`,
      ),
    ).toBe('23514');
  });

  it('url_video e pasta_url com javascript:, data: ou http: são recusadas', async () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,x',
      'http://www.youtube.com/watch?v=a',
      'https://youtube.com.evil.test/x',
      'https://evil.test/https://youtube.com',
    ]) {
      expect(
        await codigo(
          sql`insert into mentoria_midia (dono_tipo, dono_id, tipo, url_video) values ('RDV_EVENTO', ${pessoa}, 'LINK_VIDEO', ${url})`,
        ),
      ).toBe('23514');
      expect(
        await codigo(
          sql`insert into mentoria_rdv_pessoas (id, nome, nome_norm, pasta_url) values (${randomUUID()}, 'P', ${randomUUID()}, ${url})`,
        ),
      ).toBe('23514');
    }
    // Controle: link do Drive com https é aceito.
    await comoApp(
      sql`insert into mentoria_rdv_pessoas (id, nome, nome_norm, pasta_url) values (${randomUUID()}, 'P', 'p-ok', 'https://drive.google.com/drive/folders/abc')`,
    );
  });

  it('npac_app recebe 42501 em DELETE de mentoria_midia', async () => {
    expect(await codigo(sql`delete from mentoria_midia`)).toBe('42501');
  });

  it('npac_app não consegue UPDATE de mentoria_rdv_quadros.data_texto (permission denied)', async () => {
    expect(await codigo(sql`update mentoria_rdv_quadros set data_texto = '01/2026'`)).toBe('42501');
    expect(await codigo(sql`update mentoria_rdv_quadros set data = '2026-01-01'`)).toBe('42501');
  });

  it('npac_app não consegue UPDATE de mentoria_rdv_pessoas.pasta_url', async () => {
    expect(
      await codigo(
        sql`update mentoria_rdv_pessoas set pasta_url = 'https://drive.google.com/drive/folders/x'`,
      ),
    ).toBe('42501');
    // Controle: o nome é editável.
    await comoApp(sql`update mentoria_rdv_pessoas set nome = 'Mentorado Fictício 03'`);
  });

  it('npac_app não faz INSERT nem UPDATE em mentoria_rdv_diagnostico', async () => {
    expect(
      await codigo(
        sql`insert into mentoria_rdv_diagnostico (pessoa_id, idade) values (${pessoa}, 'x')`,
      ),
    ).toBe('42501');
    expect(await codigo(sql`update mentoria_rdv_diagnostico set idade = 'x'`)).toBe('42501');
  });

  it('npac_app não faz DELETE em nenhuma tabela do módulo', async () => {
    const rows = await owner<{ table_name: string; pode: boolean }[]>`
      select table_name, has_table_privilege('npac_app', format('%I', table_name), 'DELETE') as pode
      from information_schema.tables where table_schema = 'public' and table_name like 'mentoria_%'`;
    expect(rows.length).toBe(11);
    expect(rows.filter((r) => r.pode)).toEqual([]);
  });

  it('npac_app não acessa a fila de exclusão de mídia', async () => {
    expect(await codigo(sql`select * from mentoria_midia_exclusao`)).toBe('42501');
  });

  it('nenhuma coluna do módulo é bytea', async () => {
    const rows = await owner<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name like 'mentoria_%' and data_type = 'bytea'`;
    expect(rows).toEqual([]);
  });

  it('todas as tabelas com dados de pessoa têm RLS forçada com mentoria_pode()', async () => {
    const rows = await owner<{ relname: string; forced: boolean }[]>`
      select c.relname, c.relforcerowsecurity as forced from pg_class c
      where c.relkind = 'r' and c.relname like 'mentoria_%' and c.relname <> 'mentoria_midia_exclusao'`;
    expect(rows.length).toBe(10);
    expect(rows.filter((r) => !r.forced)).toEqual([]);
    const pol = await owner<{ tablename: string }[]>`
      select distinct tablename from pg_policies where tablename like 'mentoria_%' and qual like '%mentoria_pode()%'`;
    expect(pol.length).toBe(10);
  });
});
