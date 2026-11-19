import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// Fase 2, Parte 3: check-in, semáforo, histórico e segunda chance (spec 2026-11-11, E9–E16, §5).
// Datas fixas: a entrada no ar (E13) vira quarta 18/11/2026; as semanas começam nas segundas
// 16/11, 23/11, 30/11, 07/12.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const ADMIN = 's-admin';
const ACOMP = 's-acomp';
const OPERACAO = 's-operacao';
const MANU = 's-manu';
const LEO = 's-leo';
const DESDE = '2026-11-18';

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

let desdeOriginal: string;
let inscricao: string;

const novaInscricao = async (status = 'ATIVO', inicio: string | null = '2026-10-01') => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada)
    values ('INDIVIDUAL', 'RDV', ${status}, ${inicio}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, 'Mentorado Fictício S', 'mentorado ficticio s')`;
  return i!.id;
};
const semaforo = async (dia: string, insc = inscricao) =>
  (
    await owner<{ cor: string; motivos: string[] }[]>`
      select cor, motivos from mentoria_semaforo_calc(${insc}::uuid, ${dia}::date)`
  )[0] ?? null;
const checkin = (semanaDia: string, respondeu: boolean, insc = inscricao) =>
  owner`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu, respondido_em)
    values (${insc}, ${`${semanaDia}T12:00:00-03:00`}, ${respondeu},
      ${respondeu ? `${semanaDia}T15:00:00-03:00` : null})`;
const reuniao = async (insc = inscricao) => {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
    values (${insc}, 'POSICIONAMENTO', ${ACOMP}, '2026-11-10T12:00:00Z') returning id`;
  return r!.id;
};
const tarefa = async (prazo: string, status: string, origem = 'REUNIAO') => {
  const r = origem === 'REUNIAO' ? await reuniao() : null;
  const c =
    origem === 'REUNIAO'
      ? null
      : (
          await owner<{ id: string }[]>`
            insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em)
            values (${inscricao}, 1, '2026-10-01', '2026-10-20') returning id`
        )[0]!.id;
  await owner`insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, ciclo_id, descricao,
      prazo, status)
    values (${inscricao}, ${origem}, ${r}, ${c}, 'cifrado', ${prazo}, ${status})`;
};
const ciclo = async (enviado: string, insc = inscricao) =>
  (
    await owner<{ id: string }[]>`
      insert into mentoria_ciclos (inscricao_id, numero, enviado_em)
      values (${insc}, 1, ${enviado}) returning id`
  )[0]!.id;

beforeAll(async () => {
  const [d] = await owner<{ desde: string }[]>`
    select to_char(desde, 'YYYY-MM-DD') as desde from mentoria_semaforo_inicio`;
  desdeOriginal = d!.desde;
  await owner`update mentoria_semaforo_inicio set desde = ${DESDE}`;
  await owner`delete from mentoria_perfis where user_id like 's-%'`;
  await owner`delete from "user" where id like 's-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${ADMIN}, 'Admin S', 'admin@s.test', 'DIRETOR', false, false),
      (${ACOMP}, 'Acomp S', 'acomp@s.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op S', 'op@s.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu S', 'manu@s.test', 'ACOMPANHAMENTO', false, false),
      (${LEO}, 'Leo S', 'leo@s.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${ACOMP}, 'ACOMPANHAMENTO', false), (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false), (${LEO}, 'MENTOR', false)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  inscricao = await novaInscricao();
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`update mentoria_semaforo_inicio set desde = ${desdeOriginal}`;
  await owner`delete from mentoria_perfis where user_id like 's-%'`;
  await owner`delete from "user" where id like 's-%'`;
  await closeTestConnections();
});

describe('entrada no ar', () => {
  it('a migration grava o dia de Brasília em que rodou; npac_app não lê a tabela', async () => {
    expect(desdeOriginal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await pgError(como(ADMIN, sql`select desde from mentoria_semaforo_inicio`))).code).toBe(
      '42501',
    );
  });
});

describe('check-ins (E9)', () => {
  const lancar = (u: string, enviado = '2026-11-20T12:00:00-03:00') =>
    como<{ id: string; semana: string }>(
      u,
      sql`insert into mentoria_checkins (inscricao_id, enviado_em) values (${inscricao}, ${enviado})
        returning id, to_char(semana, 'YYYY-MM-DD') as semana`,
    );

  it('Admin e Acompanhamento lançam; Operação lê; Especialista e Mentor não veem; sem DELETE', async () => {
    const [c] = await lancar(ACOMP);
    const n = async (u: string) =>
      (await como<{ n: number }>(u, sql`select count(*)::int as n from mentoria_checkins`))[0]!.n;
    expect([await n(ADMIN), await n(OPERACAO), await n(MANU), await n(LEO)]).toEqual([1, 1, 0, 0]);
    expect((await pgError(lancar(OPERACAO, '2026-11-27T12:00:00-03:00'))).code).toBe('42501');
    expect((await pgError(lancar(MANU, '2026-11-27T12:00:00-03:00'))).code).toBe('42501');
    const r = await como(
      OPERACAO,
      sql`update mentoria_checkins set respondeu = true, respondido_em = now() where id = ${c!.id}
        returning id`,
    );
    expect(r).toHaveLength(0);
    expect((await pgError(como(ADMIN, sql`delete from mentoria_checkins`))).code).toBe('42501');
    const [x] = await owner<{ criado_por: string }[]>`
      select criado_por from mentoria_checkins where id = ${c!.id}`;
    expect(x!.criado_por).toBe(ACOMP);
  });

  it('semana = segunda de Brasília do envio; um por semana', async () => {
    // Domingo 22/11 às 22h de Brasília = segunda 23/11 01h em UTC: ainda é a semana de 16/11.
    const [c] = await lancar(ACOMP, '2026-11-23T01:00:00Z');
    expect(c!.semana).toBe('2026-11-16');
    expect((await pgError(lancar(ACOMP, '2026-11-17T09:00:00-03:00'))).code).toBe('23505');
    const [d] = await lancar(ACOMP, '2026-11-23T09:00:00-03:00');
    expect(d!.semana).toBe('2026-11-23');
  });

  it('respondeu exige a data da resposta, que não vem antes do envio', async () => {
    for (const q of [
      sql`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu)
        values (${inscricao}, '2026-11-20T12:00:00-03:00', true)`,
      sql`insert into mentoria_checkins (inscricao_id, enviado_em, respondido_em)
        values (${inscricao}, '2026-11-20T12:00:00-03:00', '2026-11-20T13:00:00-03:00')`,
      sql`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu, respondido_em)
        values (${inscricao}, '2026-11-20T12:00:00-03:00', true, '2026-11-20T11:00:00-03:00')`,
    ])
      expect((await pgError(como(ACOMP, q))).code).toBe('23514');
  });

  it('LGPD apaga os textos', async () => {
    await owner`insert into mentoria_checkins (inscricao_id, enviado_em, avanco, travou, proximo_passo)
      values (${inscricao}, now(), 'cifrado', 'cifrado', 'cifrado')`;
    await como(ADMIN, sql`select mentoria_anonimizar_inscricao(${inscricao}::uuid)`);
    const [c] = await owner<{ n: number }[]>`
      select num_nonnulls(avanco, travou, proximo_passo)::int as n from mentoria_checkins`;
    expect(c!.n).toBe(0);
  });
});

describe('semáforo (§5)', () => {
  it('na entrada no ar todo mundo começa verde, com tarefa e PME já atrasados', async () => {
    await tarefa('2026-11-10', 'PENDENTE');
    await ciclo('2026-09-01'); // prazo 01/10, 48 dias de atraso
    expect(await semaforo('2026-11-19')).toEqual({ cor: 'VERDE', motivos: [] });
  });

  it('check-in: a última semana encerrada sem resposta = amarelo; as 2 = vermelho (E11)', async () => {
    // 24/11: a semana de 16/11 começou antes da entrada no ar e não conta.
    expect(await semaforo('2026-11-24')).toEqual({ cor: 'VERDE', motivos: [] });
    expect(await semaforo('2026-12-01')).toEqual({ cor: 'AMARELO', motivos: ['CHECKIN_1'] });
    // Enviado sem resposta conta como sem check-in.
    await checkin('2026-11-25', false);
    expect(await semaforo('2026-12-08')).toEqual({ cor: 'VERMELHO', motivos: ['CHECKIN_2'] });
    await checkin('2026-12-02', true);
    expect(await semaforo('2026-12-08')).toEqual({ cor: 'VERDE', motivos: [] });
    expect(await semaforo('2026-12-15')).toEqual({ cor: 'AMARELO', motivos: ['CHECKIN_1'] });
  });

  it('check-in: só semanas depois do início da jornada', async () => {
    const nova = await novaInscricao('ATIVO', '2026-11-30');
    expect(await semaforo('2026-12-08', nova)).toEqual({ cor: 'VERDE', motivos: [] });
    expect(await semaforo('2026-12-15', nova)).toEqual({ cor: 'AMARELO', motivos: ['CHECKIN_1'] });
  });

  it('tarefa: PENDENTE vencida e NAO_FEITA contam; PARCIAL e FEITA não (E12)', async () => {
    await checkin('2026-11-25', true);
    await checkin('2026-12-02', true);
    await tarefa('2026-11-10', 'PENDENTE'); // antes da entrada no ar: não conta
    await tarefa('2026-11-20', 'PENDENTE');
    expect(await semaforo('2026-11-20')).toEqual({ cor: 'VERDE', motivos: [] }); // vence hoje
    expect(await semaforo('2026-11-21')).toEqual({ cor: 'AMARELO', motivos: ['TAREFA_1'] });
    await tarefa('2026-11-25', 'NAO_FEITA');
    expect(await semaforo('2026-11-26')).toEqual({ cor: 'VERMELHO', motivos: ['TAREFA_2'] });
    await tarefa('2026-11-27', 'PARCIAL');
    expect(await semaforo('2026-11-28')).toEqual({ cor: 'VERDE', motivos: [] });
    await tarefa('2026-11-29', 'NAO_FEITA');
    expect(await semaforo('2026-11-30')).toEqual({ cor: 'AMARELO', motivos: ['TAREFA_1'] });
    await tarefa('2026-11-30', 'FEITA');
    expect(await semaforo('2026-12-01')).toEqual({ cor: 'VERDE', motivos: [] });
  });

  it('tarefa: só as da reunião (as do ciclo ficam no PME_*)', async () => {
    await tarefa('2026-11-20', 'PENDENTE', 'EXTRA');
    expect(await semaforo('2026-11-23')).toEqual({ cor: 'VERDE', motivos: [] });
  });

  it('PME: 7 dias de atraso = amarelo, 15 = vermelho, contados da entrada no ar', async () => {
    await ciclo('2026-09-01');
    expect(await semaforo('2026-11-24')).toEqual({ cor: 'VERDE', motivos: [] });
    expect(await semaforo('2026-11-25')).toEqual({ cor: 'AMARELO', motivos: ['PME_7'] });
    expect((await semaforo('2026-12-03'))!.motivos).toContain('PME_15');
  });

  it('pausado, onboarding e concluído não têm semáforo', async () => {
    for (const status of ['PAUSADO', 'ONBOARDING', 'CONCLUIDO']) {
      const i = await novaInscricao(status);
      expect(await semaforo('2026-12-08', i)).toBeNull();
    }
  });

  it('quem vê: Admin, Acompanhamento e Operação; Especialista e Mentor não', async () => {
    const ver = async (u: string) =>
      (
        await como<{ cor: string | null; seq: number | null }>(
          u,
          sql`select (select cor from mentoria_semaforo(${inscricao}::uuid, '2026-12-01')) as cor,
            mentoria_sequencia_checkins(${inscricao}::uuid, '2026-12-01') as seq`,
        )
      )[0]!;
    expect(await ver(ADMIN)).toEqual({ cor: 'AMARELO', seq: 0 });
    expect(await ver(OPERACAO)).toEqual({ cor: 'AMARELO', seq: 0 });
    expect(await ver(MANU)).toEqual({ cor: null, seq: null });
    expect(await ver(LEO)).toEqual({ cor: null, seq: null });
    expect(
      (
        await pgError(
          como(ADMIN, sql`select * from mentoria_semaforo_calc(${inscricao}::uuid, now()::date)`),
        )
      ).code,
    ).toBe('42501');
  });

  it('sequência: semanas seguidas com check-in respondido até a última encerrada', async () => {
    await checkin('2026-11-18', true);
    await checkin('2026-11-25', true);
    await checkin('2026-12-02', false);
    await checkin('2026-12-09', true);
    const seq = async (dia: string) =>
      (
        await como<{ n: number }>(
          ACOMP,
          sql`select mentoria_sequencia_checkins(${inscricao}::uuid, ${dia}::date) as n`,
        )
      )[0]!.n;
    expect(await seq('2026-12-01')).toBe(2);
    expect(await seq('2026-12-08')).toBe(0);
    expect(await seq('2026-12-16')).toBe(1);
  });
});

describe('segunda chance (E15)', () => {
  it('Admin e Acompanhamento dão; Operação não; só no ciclo aberto e depois do prazo', async () => {
    const c = await ciclo('2026-11-01'); // prazo 01/12
    const dar = (u: string, ate: string | null) =>
      como<{ id: string }>(
        u,
        sql`update mentoria_ciclos set segunda_chance_ate = ${ate} where id = ${c} returning id`,
      );
    expect((await pgError(dar(OPERACAO, '2026-12-10'))).code).toBe('42501');
    expect((await pgError(dar(ACOMP, '2026-12-01'))).code).toBe('23514');
    expect(await dar(ACOMP, '2026-12-10')).toHaveLength(1);
    expect(await dar(ADMIN, null)).toHaveLength(1);
    await owner`update mentoria_ciclos set concluido_em = '2026-12-05' where id = ${c}`;
    expect((await pgError(dar(ADMIN, '2026-12-20'))).message).toMatch(/em andamento/);
  });

  it('status SEGUNDA_CHANCE enquanto vale; depois em andamento', async () => {
    const [s] = await owner<{ a: string; b: string; c: string; d: string }[]>`
      select mentoria_ciclo_status(null, null, '2026-12-01', '2026-12-10', '2026-12-10') as a,
        mentoria_ciclo_status(null, null, '2026-12-01', '2026-12-10', '2026-12-11') as b,
        mentoria_ciclo_status('2026-12-05', null, '2026-12-01', '2026-12-10', '2026-12-06') as c,
        mentoria_ciclo_status(null, null, '2026-12-01', '2026-12-08') as d`;
    expect(s).toEqual({
      a: 'SEGUNDA_CHANCE',
      b: 'EM_ANDAMENTO',
      c: 'CONCLUIDO',
      d: 'EM_ANDAMENTO',
    });
  });

  it('o atraso do semáforo conta do novo prazo (E16)', async () => {
    await checkin('2026-11-25', true);
    await checkin('2026-12-02', true);
    await checkin('2026-12-09', true);
    await checkin('2026-12-16', true);
    const c = await ciclo('2026-11-01'); // prazo 01/12
    expect(await semaforo('2026-12-08')).toEqual({ cor: 'AMARELO', motivos: ['PME_7'] });
    await owner`update mentoria_ciclos set segunda_chance_ate = '2026-12-10' where id = ${c}`;
    expect(await semaforo('2026-12-08')).toEqual({ cor: 'VERDE', motivos: [] });
    expect(await semaforo('2026-12-17')).toEqual({ cor: 'AMARELO', motivos: ['PME_7'] });
    expect(await semaforo('2026-12-25')).toEqual({ cor: 'VERMELHO', motivos: ['PME_15'] });
  });
});

describe('histórico semanal', () => {
  const gravar = async (hoje: string) =>
    (await como<{ n: number }>(ADMIN, sql`select mentoria_semaforo_gravar(${hoje}::date) as n`))[0]!
      .n;
  const historico = (insc = inscricao) =>
    owner<{ semana: string; cor: string; motivos: string[] }[]>`
      select to_char(semana, 'YYYY-MM-DD') as semana, cor, motivos
      from mentoria_semaforo_historico where inscricao_id = ${insc} order by semana`;

  it('grava cada semana encerrada desde a entrada no ar, uma vez só', async () => {
    await ciclo('2026-10-20'); // prazo 19/11
    const pausado = await novaInscricao('PAUSADO');
    const depois = await novaInscricao('ATIVO', '2026-11-25');
    expect(await gravar('2026-12-09')).toBe(5);
    expect(await historico()).toEqual([
      { semana: '2026-11-16', cor: 'VERDE', motivos: [] },
      { semana: '2026-11-23', cor: 'AMARELO', motivos: ['CHECKIN_1', 'PME_7'] },
      { semana: '2026-11-30', cor: 'VERMELHO', motivos: ['CHECKIN_2', 'PME_15'] },
    ]);
    expect((await historico(depois)).map((h) => h.semana)).toEqual(['2026-11-23', '2026-11-30']);
    expect(await historico(pausado)).toEqual([]);
    expect(await gravar('2026-12-09')).toBe(0);
    expect(await gravar('2026-12-14')).toBe(2);
    expect((await historico()).map((h) => h.semana).at(-1)).toBe('2026-12-07');
  });

  it('leitura: Admin, Acompanhamento e Operação; Especialista não; sem escrita direta', async () => {
    await gravar('2026-12-09');
    const n = async (u: string) =>
      (
        await como<{ n: number }>(
          u,
          sql`select count(*)::int as n from mentoria_semaforo_historico`,
        )
      )[0]!.n;
    expect([await n(ACOMP), await n(OPERACAO), await n(MANU)]).toEqual([3, 3, 0]);
    expect(
      (
        await pgError(
          como(
            ADMIN,
            sql`insert into mentoria_semaforo_historico (inscricao_id, semana, cor)
              values (${inscricao}, '2026-12-14', 'VERDE')`,
          ),
        )
      ).code,
    ).toBe('42501');
  });
});
