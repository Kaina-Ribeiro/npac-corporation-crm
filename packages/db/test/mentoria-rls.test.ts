import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'm-diretor';
const ACOMP = 'm-acomp';
const HEAD = 'm-head';
const SDR = 'm-sdr';
const CLOSER = 'm-closer';

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

const contar = (userId: string) =>
  withUser(db, userId, async (tx) => {
    const r = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from mentoria_mentorados`,
    );
    return r[0]?.n ?? 0;
  });

const inserir = (userId: string, nome: string) =>
  withUser(db, userId, (tx) =>
    tx.execute(
      sql`insert into mentoria_mentorados (nome, nome_norm, status) values (${nome}, ${nome.toLowerCase()}, 'ENGAJADO')`,
    ),
  );

beforeAll(async () => {
  await owner`delete from "user" where id like 'm-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DIRETOR}, 'Diretor M', 'diretor@m.test', 'DIRETOR', false, false),
      (${ACOMP}, 'Acomp M', 'acomp@m.test', 'ACOMPANHAMENTO', false, false),
      (${HEAD}, 'Head M', 'head@m.test', 'HEAD', false, false),
      (${SDR}, 'Sdr M', 'sdr@m.test', 'SDR', true, false),
      (${CLOSER}, 'Closer M', 'closer@m.test', 'CLOSER', false, true)`;
});
beforeEach(async () => {
  await owner`truncate mentoria_mentorados cascade`;
  await owner`update "user" set active = true where id like 'm-%'`;
  await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 01', 'mentorado ficticio 01', 'ENGAJADO')`;
});
afterAll(async () => {
  await owner`truncate mentoria_mentorados cascade`;
  await owner`delete from "user" where id like 'm-%'`;
  await closeTestConnections();
});

describe('mentoria_mentorados (RLS)', () => {
  it('DIRETOR e ACOMPANHAMENTO leem e alteram mentoria_mentorados', async () => {
    expect(await contar(DIRETOR)).toBe(1);
    expect(await contar(ACOMP)).toBe(1);
    await inserir(ACOMP, 'Mentorado Fictício 02');
    const n = await withUser(db, DIRETOR, async (tx) => {
      const r = await tx.execute(
        sql`update mentoria_mentorados set status = 'EM_RISCO', version = version + 1 where nome_norm = 'mentorado fictício 02' returning id`,
      );
      return r.length;
    });
    expect(n).toBe(1);
    expect(await contar(DIRETOR)).toBe(2);
  });

  it('HEAD, SDR e CLOSER recebem zero linhas no SELECT', async () => {
    for (const u of [HEAD, SDR, CLOSER]) expect(await contar(u)).toBe(0);
  });

  it('HEAD, SDR e CLOSER são recusados no INSERT (erro de RLS)', async () => {
    for (const u of [HEAD, SDR, CLOSER]) {
      const err = await pgError(inserir(u, `Mentorado Fictício ${u}`));
      expect(err.code).toBe('42501');
    }
  });

  it('usuário ACOMPANHAMENTO inativo não lê nada', async () => {
    await owner`update "user" set active = false where id = ${ACOMP}`;
    expect(await contar(ACOMP)).toBe(0);
  });

  it('DIRETOR lê mesmo com app_role() devolvendo HEAD', async () => {
    const role = await withUser(db, DIRETOR, async (tx) => {
      const r = await tx.execute<{ r: string }>(sql`select app_role()::text as r`);
      return r[0]?.r;
    });
    expect(role).toBe('HEAD');
    expect(await contar(DIRETOR)).toBe(1);
  });

  it('nenhuma policy de mentoria_* cita app_role()', async () => {
    const rows = await owner<
      { tablename: string; qual: string | null; with_check: string | null }[]
    >`
      select tablename, qual, with_check from pg_policies
      where tablename like 'mentoria_%' and tablename <> 'mentoria_midia_exclusao'`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(`${r.qual} ${r.with_check}`).not.toContain('app_role');
      expect(r.qual).toContain('mentoria_pode()');
    }
  });

  it('SELECT … FOR UPDATE funciona com GRANT de UPDATE nas colunas editáveis', async () => {
    const rows = await withUser(db, ACOMP, (tx) =>
      tx.execute(sql`select id, version from mentoria_mentorados for update`),
    );
    expect(rows.length).toBe(1);
  });

  it('npac_app não apaga nem altera colunas de autoria', async () => {
    expect(
      (
        await pgError(
          withUser(db, DIRETOR, (tx) => tx.execute(sql`delete from mentoria_mentorados`)),
        )
      ).code,
    ).toBe('42501');
    expect(
      (
        await pgError(
          withUser(db, DIRETOR, (tx) =>
            tx.execute(sql`update mentoria_mentorados set created_by = null`),
          ),
        )
      ).code,
    ).toBe('42501');
  });

  it('status fora da lista e nome vazio são recusados', async () => {
    const st = await pgError(
      withUser(db, ACOMP, (tx) =>
        tx.execute(
          sql`insert into mentoria_mentorados (nome, nome_norm, status) values ('X', 'x', 'ESFRIANDO')`,
        ),
      ),
    );
    expect(st.code).toBe('23514');
    expect((await pgError(inserir(ACOMP, ''))).code).toBe('23514');
  });
});
