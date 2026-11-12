import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// Fase 2, Parte 2: metas, tarefas da reunião e % do PME (spec 2026-11-11, §3, §4 e §8).
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const ADMIN = 'q-admin';
const ACOMP = 'q-acomp';
const OPERACAO = 'q-operacao';
const MANU = 'q-manu';
const LEO = 'q-leo';

async function pgError(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error && e.cause instanceof Error ? e.cause : e;
    return err as { code?: string; message: string };
  }
  throw new Error('esperava erro');
}

const como = <T extends Record<string, unknown>>(id: string, q: ReturnType<typeof sql>) =>
  withUser(db, id, async (tx) => tx.execute<T>(q));

let inscricao: string;
let outraInscricao: string;

const novaInscricao = async (nome: string) => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status)
    values ('INDIVIDUAL', 'RDV', 'ATIVO') returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${nome}, ${nome.toLowerCase()})`;
  return i!.id;
};
const reuniao = async (condutor: string, insc = inscricao) => {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
    values (${insc}, 'POSICIONAMENTO', ${condutor}, now() - interval '1 hour') returning id`;
  return r!.id;
};
const ciclo = async () => {
  const [c] = await owner<{ id: string }[]>`
    insert into mentoria_ciclos (inscricao_id, numero, enviado_em)
    values (${inscricao}, 1, (now() at time zone 'America/Sao_Paulo')::date) returning id`;
  return c!.id;
};
const criarTarefa = (quem: string, reuniaoId: string, extra = sql``) =>
  como<{ id: string }>(
    quem,
    sql`insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, descricao, prazo)
      values (${inscricao}, 'REUNIAO', ${reuniaoId}, 'cifrado', '2026-12-01') ${extra}
      returning id`,
  );
const criarMeta = (quem: string, campos = sql`'cifrado'`) =>
  como<{ id: string }>(
    quem,
    sql`insert into mentoria_metas (inscricao_id, descricao) values (${inscricao}, ${campos})
      returning id`,
  );
const pct = async (cicloId: string, quem = ADMIN) =>
  (
    await como<{ t: number | null }>(quem, sql`select mentoria_pct_tarefas(${cicloId}::uuid) as t`)
  )[0]!;

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'q-%'`;
  await owner`delete from "user" where id like 'q-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${ADMIN}, 'Admin Q', 'admin@q.test', 'DIRETOR', false, false),
      (${ACOMP}, 'Acomp Q', 'acomp@q.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op Q', 'op@q.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu Q', 'manu@q.test', 'ACOMPANHAMENTO', false, false),
      (${LEO}, 'Leo Q', 'leo@q.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${ACOMP}, 'ACOMPANHAMENTO', false),
      (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false),
      (${LEO}, 'MENTOR', false)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  inscricao = await novaInscricao('Mentorado Fictício 01');
  outraInscricao = await novaInscricao('Mentorado Fictício 02');
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'q-%'`;
  await owner`delete from "user" where id like 'q-%'`;
  await closeTestConnections();
});

describe('metas', () => {
  it('Admin e Acompanhamento escrevem; Operação só lê; Especialista e Mentor não veem', async () => {
    await reuniao(MANU);
    const [m] = await criarMeta(ACOMP);
    const n = async (u: string) =>
      (await como<{ n: number }>(u, sql`select count(*)::int as n from mentoria_metas`))[0]!.n;
    expect(await n(ADMIN)).toBe(1);
    expect(await n(OPERACAO)).toBe(1);
    expect(await n(MANU)).toBe(0);
    expect(await n(LEO)).toBe(0);
    expect((await pgError(criarMeta(OPERACAO))).code).toBe('42501');
    expect((await pgError(criarMeta(MANU))).code).toBe('42501');
    const r = await como(
      OPERACAO,
      sql`update mentoria_metas set valor_atual = 3 where id = ${m!.id} returning id`,
    );
    expect(r).toHaveLength(0);
    await como(ADMIN, sql`update mentoria_metas set valor_atual = 3 where id = ${m!.id}`);
    const [x] = await owner<{ v: string; criado_por: string }[]>`
      select valor_atual::text as v, criado_por from mentoria_metas where id = ${m!.id}`;
    expect(x).toEqual({ v: '3.00', criado_por: ACOMP });
  });

  it('npac_app não apaga meta nem tarefa', async () => {
    const r = await reuniao(ACOMP);
    await criarMeta(ACOMP);
    await criarTarefa(ACOMP, r);
    expect((await pgError(como(ADMIN, sql`delete from mentoria_metas`))).code).toBe('42501');
    expect((await pgError(como(ADMIN, sql`delete from mentoria_tarefas`))).code).toBe('42501');
  });

  it('ciclo, reunião e pessoa da mesma inscrição', async () => {
    const r = await reuniao(ACOMP, outraInscricao);
    const [p] = await owner<{ id: string }[]>`
      select id from mentoria_pessoas where inscricao_id = ${outraInscricao}`;
    for (const q of [
      sql`insert into mentoria_metas (inscricao_id, descricao, reuniao_id) values (${inscricao}, 'x', ${r})`,
      sql`insert into mentoria_metas (inscricao_id, descricao, pessoa_id) values (${inscricao}, 'x', ${p!.id})`,
    ])
      expect((await pgError(como(ACOMP, q))).message).toMatch(/outro mentorado/);
  });

  it('valores: alvo > 0, atual ≥ 0, pilar da lista; sem coluna de status (S3)', async () => {
    for (const q of [
      sql`insert into mentoria_metas (inscricao_id, descricao, valor_alvo) values (${inscricao}, 'x', 0)`,
      sql`insert into mentoria_metas (inscricao_id, descricao, valor_atual) values (${inscricao}, 'x', -1)`,
      sql`insert into mentoria_metas (inscricao_id, descricao, pilar) values (${inscricao}, 'x', 'OUTRO')`,
    ])
      expect((await pgError(como(ACOMP, q))).code).toBe('23514');
    const [c] = await owner<{ n: number }[]>`
      select count(*)::int as n from information_schema.columns
      where table_name = 'mentoria_metas' and column_name = 'status'`;
    expect(c!.n).toBe(0);
  });
});

describe('tarefas da reunião', () => {
  it('Especialista cria e edita só na reunião que conduz; Operação não cria', async () => {
    const dela = await reuniao(MANU);
    const outra = await reuniao(ACOMP);
    const [t] = await criarTarefa(MANU, dela);
    expect((await pgError(criarTarefa(MANU, outra))).code).toBe('42501');
    expect((await pgError(criarTarefa(OPERACAO, dela))).code).toBe('42501');
    await como(
      MANU,
      sql`update mentoria_tarefas set descricao = 'y', prazo = '2026-12-05'
      where id = ${t!.id}`,
    );
    const [x] = await owner<{ descricao: string; prazo: string }[]>`
      select descricao, to_char(prazo, 'YYYY-MM-DD') as prazo from mentoria_tarefas
      where id = ${t!.id}`;
    expect(x).toEqual({ descricao: 'y', prazo: '2026-12-05' });
  });

  it('a 4ª tarefa da mesma reunião é recusada', async () => {
    const r = await reuniao(ACOMP);
    for (let k = 0; k < 3; k++) await criarTarefa(ACOMP, r);
    expect((await pgError(criarTarefa(ACOMP, r))).message).toMatch(/Até 3 tarefas/);
  });

  it('só a tarefa da reunião muda texto, prazo e meta', async () => {
    const c = await ciclo();
    const [t] = await owner<{ id: string }[]>`
      insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao, prazo)
      values (${inscricao}, 'EXTRA', ${c}, 'x', '2026-12-01') returning id`;
    for (const q of [
      sql`update mentoria_tarefas set descricao = 'y' where id = ${t!.id}`,
      sql`update mentoria_tarefas set prazo = '2026-12-09' where id = ${t!.id}`,
    ])
      expect((await pgError(como(ACOMP, q))).message).toMatch(/Só a tarefa da reunião/);
  });

  it('reunião, ciclo e meta da mesma inscrição', async () => {
    const r = await reuniao(ACOMP, outraInscricao);
    expect((await pgError(criarTarefa(ACOMP, r))).message).toMatch(/outro mentorado/);
    const minha = await reuniao(ACOMP);
    const [m] = await owner<{ id: string }[]>`
      insert into mentoria_metas (inscricao_id, descricao) values (${outraInscricao}, 'x')
      returning id`;
    expect(
      (
        await pgError(
          criarTarefa(ACOMP, minha, sql``).then(() => {
            return como(
              ACOMP,
              sql`update mentoria_tarefas set meta_id = ${m!.id}
          where reuniao_id = ${minha}`,
            );
          }),
        )
      ).message,
    ).toMatch(/outro mentorado/);
  });

  it('reunião com tarefa ou meta não é excluída', async () => {
    const [r] = await owner<{ id: string }[]>`
      insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${inscricao}, 'POSICIONAMENTO', ${ACOMP}, now() + interval '1 day') returning id`;
    await criarTarefa(ACOMP, r!.id);
    expect(
      (await pgError(como(ACOMP, sql`select mentoria_excluir_reuniao(${r!.id}::uuid)`))).message,
    ).toMatch(/sem registro/);
  });
});

describe('% do PME', () => {
  it('tarefas: FEITA ÷ total, PARCIAL não conta; nulo sem tarefas', async () => {
    const c = await ciclo();
    expect((await pct(c)).t).toBeNull();
    await owner`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao, prazo, status)
      values (${inscricao}, 'EXTRA', ${c}, 'x', '2026-12-01', 'FEITA'),
        (${inscricao}, 'EXTRA', ${c}, 'x', '2026-12-01', 'PARCIAL'),
        (${inscricao}, 'ENCERRAMENTO', ${c}, 'x', '2026-12-01', 'PENDENTE')`;
    expect((await pct(c)).t).toBe(33);
  });

  it('metas não viram um número único (pendente com a Eduarda): sem função de % de metas', async () => {
    const [f] = await owner<{ n: number }[]>`
      select count(*)::int as n from pg_proc where proname = 'mentoria_pct_metas'`;
    expect(f!.n).toBe(0);
  });

  it('a Especialista vê o mesmo número; o Mentor, nulo', async () => {
    const c = await ciclo();
    await reuniao(MANU);
    await owner`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao, prazo, status)
      values (${inscricao}, 'EXTRA', ${c}, 'x', '2026-12-01', 'FEITA'),
        (${inscricao}, 'ENCERRAMENTO', ${c}, 'x', '2026-12-01', 'PENDENTE')`;
    expect((await pct(c, MANU)).t).toBe(50);
    expect((await pct(c, LEO)).t).toBeNull();
  });
});

describe('LGPD', () => {
  it('anonimizar apaga a descrição das metas', async () => {
    await criarMeta(ACOMP);
    await como(ADMIN, sql`select mentoria_anonimizar_inscricao(${inscricao}::uuid)`);
    const [m] = await owner<{ descricao: string | null }[]>`
      select descricao from mentoria_metas where inscricao_id = ${inscricao}`;
    expect(m!.descricao).toBeNull();
  });
});
