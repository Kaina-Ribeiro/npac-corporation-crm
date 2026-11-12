import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// Fase 2, Parte 1: catálogo de PMEs, ciclos e tarefas (spec 2026-11-11, §3 e §8).
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const ADMIN = 'p-admin';
const ACOMP = 'p-acomp';
const OPERACAO = 'p-operacao';
const MANU = 'p-manu';
const LEO = 'p-leo';

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
let pme1: string;

/** Ciclo pelo app (RLS e gatilhos valendo), com a tarefa de encerramento e uma extra. */
const enviar = async (quem: string, numero: number, enviado: string) =>
  withUser(db, quem, async (tx) => {
    const [c] = await tx.execute<{ id: string }>(sql`
      insert into mentoria_ciclos (inscricao_id, pme_id, numero, enviado_em)
      values (${inscricao}, ${numero === 1 ? pme1 : null}, ${numero}, ${enviado}::date)
      returning id`);
    await tx.execute(sql`
      insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, ordem, descricao, prazo)
      select ${inscricao}, o, ${c!.id}, n, 'cifrado', c.prazo
      from mentoria_ciclos c, (values ('EXTRA', 0), ('ENCERRAMENTO', 1)) v(o, n)
      where c.id = ${c!.id}`);
    return c!.id;
  });

const tarefa = async (ciclo: string, origem: string) => {
  const [t] = await owner<{ id: string; version: number }[]>`
    select id, version from mentoria_tarefas where ciclo_id = ${ciclo} and origem = ${origem}`;
  return t!;
};
const marcar = (quem: string, id: string, status: string) =>
  como(quem, sql`update mentoria_tarefas set status = ${status} where id = ${id}`);
const ciclo = async (id: string) =>
  (
    await owner<
      { concluido_em: string | null; nao_concluido_em: string | null; prazo: string }[]
    >`select to_char(concluido_em, 'YYYY-MM-DD') as concluido_em,
        to_char(nao_concluido_em, 'YYYY-MM-DD') as nao_concluido_em,
        to_char(prazo, 'YYYY-MM-DD') as prazo
      from mentoria_ciclos where id = ${id}`
  )[0]!;

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'p-%'`;
  await owner`delete from "user" where id like 'p-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${ADMIN}, 'Admin P', 'admin@p.test', 'DIRETOR', false, false),
      (${ACOMP}, 'Acomp P', 'acomp@p.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op P', 'op@p.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu P', 'manu@p.test', 'ACOMPANHAMENTO', false, false),
      (${LEO}, 'Leo P', 'leo@p.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${ACOMP}, 'ACOMPANHAMENTO', false),
      (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false),
      (${LEO}, 'MENTOR', false)`;
  const [p] = await owner<{ id: string }[]>`select id from mentoria_pmes where numero = 1`;
  pme1 = p!.id;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status)
    values ('INDIVIDUAL', 'RDV', 'ATIVO') returning id`;
  inscricao = i!.id;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${inscricao}, 1, 'Mentorado Fictício 01', 'mentorado ficticio 01')`;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'p-%'`;
  await owner`delete from "user" where id like 'p-%'`;
  await closeTestConnections();
});

describe('catálogo de PMEs', () => {
  it('a migration traz o 1º e o 2º PME do PDF', async () => {
    const r = await owner<{ numero: number; extras: number; encerramento: string | null }[]>`
      select numero, cardinality(atividades_extras) as extras, encerramento
      from mentoria_pmes order by numero`;
    expect(r.map((x) => [x.numero, x.extras])).toEqual([
      [1, 2],
      [2, 4],
    ]);
    expect(r[0]!.encerramento).toMatch(/queimá-las/);
    expect(r[1]!.encerramento).toBeNull();
  });

  it('só Admin escreve; os perfis leem; Mentor não vê', async () => {
    const n = async (u: string) =>
      (await como<{ n: number }>(u, sql`select count(*)::int as n from mentoria_pmes`))[0]!.n;
    expect(await n(OPERACAO)).toBe(2);
    expect(await n(MANU)).toBe(2);
    expect(await n(LEO)).toBe(0);
    const err = await pgError(como(ACOMP, sql`insert into mentoria_pmes (numero) values (3)`));
    expect(err.code).toBe('42501');
    const r = await como<{ n: number }>(
      ACOMP,
      sql`update mentoria_pmes set titulo = 'X' where numero = 1 returning 1 as n`,
    );
    expect(r.length).toBe(0);
  });

  it('número único e entre 0 e 12', async () => {
    expect(
      (await pgError(como(ADMIN, sql`insert into mentoria_pmes (numero) values (1)`))).code,
    ).toBe('23505');
    expect(
      (await pgError(como(ADMIN, sql`insert into mentoria_pmes (numero) values (13)`))).code,
    ).toBe('23514');
    await como(ADMIN, sql`insert into mentoria_pmes (numero) values (0)`);
    await owner`delete from mentoria_pmes where numero = 0`;
  });

  it('npac_app não apaga do catálogo', async () => {
    const err = await pgError(como(ADMIN, sql`delete from mentoria_pmes`));
    expect(err.code).toBe('42501');
  });
});

describe('ciclos', () => {
  it('prazo = envio + 30 e acompanha a correção, junto com as tarefas do ciclo', async () => {
    const c = await enviar(OPERACAO, 1, '2026-10-01');
    expect((await ciclo(c)).prazo).toBe('2026-10-31');
    await como(OPERACAO, sql`update mentoria_ciclos set enviado_em = '2026-10-05' where id = ${c}`);
    expect((await ciclo(c)).prazo).toBe('2026-11-04');
    const prazos = await owner<{ p: string }[]>`
      select distinct to_char(prazo, 'YYYY-MM-DD') as p, to_char(data_cobranca, 'YYYY-MM-DD') as d
      from mentoria_tarefas where ciclo_id = ${c}`;
    expect(prazos).toEqual([{ p: '2026-11-04', d: '2026-11-04' }]);
  });

  it('número único por inscrição e só cresce', async () => {
    await enviar(OPERACAO, 2, '2026-10-01');
    const err = await pgError(enviar(OPERACAO, 1, '2026-10-02'));
    expect(err.message).toMatch(/já foi registrado/);
  });

  it('um ciclo aberto por inscrição', async () => {
    await enviar(OPERACAO, 1, '2026-10-01');
    const err = await pgError(
      owner`insert into mentoria_ciclos (inscricao_id, numero, enviado_em)
        values (${inscricao}, 2, '2026-10-20')`,
    );
    expect((err as { code?: string }).code).toBe('23505');
  });

  it('status derivado: 9 dias de atraso em andamento, 10 e 16 segunda chance, 17 não concluído', async () => {
    const st = async (hoje: string) =>
      (
        await owner<{ s: string }[]>`
          select mentoria_ciclo_status(null, null, '2026-10-31'::date, ${hoje}::date) as s`
      )[0]!.s;
    expect(await st('2026-10-20')).toBe('EM_ANDAMENTO');
    expect(await st('2026-11-09')).toBe('EM_ANDAMENTO');
    expect(await st('2026-11-10')).toBe('SEGUNDA_CHANCE');
    expect(await st('2026-11-16')).toBe('SEGUNDA_CHANCE');
    expect(await st('2026-11-17')).toBe('NAO_CONCLUIDO');
    const [x] = await owner<{ a: string; b: string }[]>`
      select mentoria_ciclo_status('2026-11-20', null, '2026-10-31', '2026-12-31') as a,
        mentoria_ciclo_status(null, '2026-11-02', '2026-10-31', '2026-11-03') as b`;
    expect(x).toEqual({ a: 'CONCLUIDO', b: 'NAO_CONCLUIDO' });
  });

  it('Especialista lê os ciclos só das inscrições que vê; Mentor nada; ninguém apaga', async () => {
    await enviar(ACOMP, 1, '2026-10-01');
    const n = async (u: string) =>
      (await como<{ n: number }>(u, sql`select count(*)::int as n from mentoria_ciclos`))[0]!.n;
    expect(await n(MANU)).toBe(0);
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${inscricao}, 'POSICIONAMENTO', ${MANU}, now())`;
    expect(await n(MANU)).toBe(1);
    expect(await n(LEO)).toBe(0);
    expect((await pgError(como(ADMIN, sql`delete from mentoria_ciclos`))).code).toBe('42501');
    const r = await como<{ id: string }>(
      MANU,
      sql`update mentoria_ciclos set enviado_em = '2026-10-02' returning id`,
    );
    expect(r.length).toBe(0);
  });
});

describe('tarefas e encerramento', () => {
  it('encerramento FEITA fecha o ciclo; voltar para pendente reabre; cobrada_por do banco', async () => {
    const c = await enviar(OPERACAO, 1, '2026-10-01');
    const t = await tarefa(c, 'ENCERRAMENTO');
    await marcar(ACOMP, t.id, 'FEITA');
    expect((await ciclo(c)).concluido_em).not.toBeNull();
    const [m] = await owner<{ por: string; em: Date | null }[]>`
      select cobrada_por as por, cobrada_em as em from mentoria_tarefas where id = ${t.id}`;
    expect(m!.por).toBe(ACOMP);
    expect(m!.em).not.toBeNull();
    const h = await owner<{ tipo: string }[]>`
      select tipo from mentoria_historico where inscricao_id = ${inscricao} order by id`;
    expect(h.map((x) => x.tipo)).toContain('pme.concluido');
    await marcar(ACOMP, t.id, 'PENDENTE');
    expect((await ciclo(c)).concluido_em).toBeNull();
  });

  it('não reabre o encerramento depois do PME seguinte enviado', async () => {
    const c = await enviar(ACOMP, 1, '2026-10-01');
    const t = await tarefa(c, 'ENCERRAMENTO');
    await marcar(ACOMP, t.id, 'FEITA');
    await enviar(ACOMP, 2, '2026-10-20');
    const err = await pgError(marcar(ACOMP, t.id, 'PENDENTE'));
    expect(err.message).toMatch(/PME seguinte já foi enviado/);
  });

  it('Operação cria as tarefas do envio, mas não marca; Mentor não vê', async () => {
    const c = await enviar(OPERACAO, 1, '2026-10-01');
    const t = await tarefa(c, 'EXTRA');
    const r = await como<{ id: string }>(
      OPERACAO,
      sql`update mentoria_tarefas set status = 'FEITA' where id = ${t.id} returning id`,
    );
    expect(r.length).toBe(0);
    const n = (
      await como<{ n: number }>(LEO, sql`select count(*)::int as n from mentoria_tarefas`)
    )[0]!.n;
    expect(n).toBe(0);
  });

  it('Especialista vê e marca só as tarefas da reunião que conduziu', async () => {
    const c = await enviar(ACOMP, 1, '2026-10-01');
    const [r] = await owner<{ id: string }[]>`
      insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${inscricao}, 'POSICIONAMENTO', ${MANU}, now() - interval '1 hour') returning id`;
    const [outra] = await owner<{ id: string }[]>`
      insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${inscricao}, 'ACOMP_2PME', ${ACOMP}, now() - interval '1 hour') returning id`;
    await owner`insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, descricao, prazo)
      values (${inscricao}, 'REUNIAO', ${r!.id}, 'x', '2026-11-20'),
        (${inscricao}, 'REUNIAO', ${outra!.id}, 'x', '2026-11-20')`;
    const vistas = await como<{ reuniao_id: string | null; ciclo_id: string | null }>(
      MANU,
      sql`select reuniao_id, ciclo_id from mentoria_tarefas`,
    );
    expect(vistas).toEqual([{ reuniao_id: r!.id, ciclo_id: null }]);
    const ok = await como<{ id: string }>(
      MANU,
      sql`update mentoria_tarefas set status = 'NAO_FEITA' where reuniao_id = ${r!.id} returning id`,
    );
    expect(ok.length).toBe(1);
    const extra = await tarefa(c, 'EXTRA');
    const nada = await como<{ id: string }>(
      MANU,
      sql`update mentoria_tarefas set status = 'FEITA' where id = ${extra.id} returning id`,
    );
    expect(nada.length).toBe(0);
  });

  it('até 3 tarefas por reunião: a 4ª é recusada', async () => {
    const [r] = await owner<{ id: string }[]>`
      insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${inscricao}, 'ACOMP_2PME', ${ACOMP}, now() - interval '1 hour') returning id`;
    const criar = () =>
      como(
        ACOMP,
        sql`insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, descricao, prazo)
          values (${inscricao}, 'REUNIAO', ${r!.id}, 'x', '2026-11-20')`,
      );
    await criar();
    await criar();
    await criar();
    const err = await pgError(criar());
    expect(err.message).toMatch(/Até 3 tarefas por reunião/);
  });

  it('motivo só em parcial ou não feita; npac_app não apaga tarefa', async () => {
    const c = await enviar(ACOMP, 1, '2026-10-01');
    const t = await tarefa(c, 'EXTRA');
    const err = await pgError(
      como(ACOMP, sql`update mentoria_tarefas set motivo = 'x' where id = ${t.id}`),
    );
    expect(err.code).toBe('23514');
    await como(
      ACOMP,
      sql`update mentoria_tarefas set status = 'PARCIAL', motivo = 'x' where id = ${t.id}`,
    );
    expect((await pgError(como(ADMIN, sql`delete from mentoria_tarefas`))).code).toBe('42501');
  });

  it('fechar à mão só ciclo sem encerramento, e só quem marca tarefas', async () => {
    const c = await enviar(ACOMP, 1, '2026-10-01');
    const err = await pgError(
      como(ACOMP, sql`update mentoria_ciclos set concluido_em = '2026-10-10' where id = ${c}`),
    );
    expect(err.message).toMatch(/Marque a tarefa de encerramento/);
    // O 1 fica não concluído, como faz o envio do seguinte com um ciclo aberto.
    await como(
      ACOMP,
      sql`update mentoria_ciclos set nao_concluido_em = '2026-10-20' where id = ${c}`,
    );
    const [a] = await como<{ id: string }>(
      ACOMP,
      sql`insert into mentoria_ciclos (inscricao_id, numero, enviado_em, anterior_ao_sistema)
        values (${inscricao}, 2, '2026-10-20', true) returning id`,
    );
    const op = await pgError(
      como(
        OPERACAO,
        sql`update mentoria_ciclos set concluido_em = '2026-10-25' where id = ${a!.id}`,
      ),
    );
    expect(op.code).toBe('42501');
    await como(
      ACOMP,
      sql`update mentoria_ciclos set concluido_em = '2026-10-25' where id = ${a!.id}`,
    );
    expect((await ciclo(a!.id)).concluido_em).toBe('2026-10-25');
  });
});

describe('LGPD e mídia', () => {
  it('anonimizar apaga descrição e motivo das tarefas e mantém o ciclo', async () => {
    const c = await enviar(ACOMP, 1, '2026-10-01');
    await como(ADMIN, sql`select mentoria_anonimizar_inscricao(${inscricao}::uuid)`);
    const t = await owner<{ d: string | null }[]>`
      select descricao as d from mentoria_tarefas where ciclo_id = ${c}`;
    expect(t.every((x) => x.d === null)).toBe(true);
    expect(await ciclo(c)).toBeTruthy();
  });

  it('comprovante segue a tarefa e vai para a fila ao excluir a inscrição', async () => {
    const c = await enviar(ACOMP, 1, '2026-10-01');
    const t = await tarefa(c, 'EXTRA');
    await withUser(db, ACOMP, (tx) =>
      tx.execute(sql`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, criado_por)
        values ('TAREFA_COMPROVANTE', ${t.id}, 'PDF', 'comprovante/p1.pdf', ${ACOMP})`),
    );
    const visto = await como<{ n: number }>(
      OPERACAO,
      sql`select count(*)::int as n from mentoria_midia where dono_id = ${t.id}`,
    );
    expect(visto[0]!.n).toBe(1);
    const op = await pgError(
      withUser(db, OPERACAO, (tx) =>
        tx.execute(sql`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, criado_por)
          values ('TAREFA_COMPROVANTE', ${t.id}, 'PDF', 'comprovante/p2.pdf', ${OPERACAO})`),
      ),
    );
    expect(op.code).toBe('42501');
    await como(ADMIN, sql`select mentoria_excluir_inscricao(${inscricao}::uuid)`);
    const fila = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_midia_exclusao where chave_objeto = 'comprovante/p1.pdf'`;
    expect(fila[0]!.n).toBe(1);
    await owner`delete from mentoria_midia_exclusao where chave_objeto like 'comprovante/%'`;
  });
});
