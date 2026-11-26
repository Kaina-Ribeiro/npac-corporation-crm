import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// NPAC-79 (migration 0092; Duda 1A, 2C, 3B, 4B, 5A, 6A, 7A, 8A; Gabriel G1–G6): a renovação fica na mesma ficha.
// O término anda 12 meses, a mentoria pode trocar, a ficha continua ATIVO e as ações do novo ano saem do plano-modelo
// da mentoria escolhida, só dos meses do novo ano. Desfazer: só a Admin, só a última, sem ação do novo ano feita.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'rn-diretor';
const DUDA = 'rn-duda'; // Acompanhamento + Admin
const ACOMP = 'rn-acomp';
const CART = 'rn-cart'; // Acompanhamento "só a carteira"
const OPERACAO = 'rn-operacao';
const ESPEC = 'rn-espec';
const MENTOR = 'rn-mentor';

type PgErro = { code?: string; message: string };
async function pgError(p: Promise<unknown>): Promise<PgErro> {
  try {
    await p;
  } catch (e) {
    const err = e instanceof Error && e.cause instanceof Error ? e.cause : e;
    return err as PgErro;
  }
  throw new Error('esperava erro');
}

const q = <T extends Record<string, unknown>>(id: string, s: ReturnType<typeof sql>) =>
  withUser(db, id, async (tx) => [...(await tx.execute<T>(s))]);

let HOJE = '';
/** Dia de Brasília somado de `d` dias, como texto AAAA-MM-DD. */
const dia = async (d: number) =>
  (await owner<{ d: string }[]>`select (${HOJE}::date + ${d}::int)::text as d`)[0]!.d;

type Insc = {
  mentoria: string;
  status: string;
  termino_previsto: string | null;
  inicio_jornada: string | null;
  concluida_em: Date | null;
  version: number;
};
const ler = async (id: string) =>
  (
    await owner<Insc[]>`
    select mentoria, status, termino_previsto::text, inicio_jornada::text, concluida_em, version
    from mentoria_inscricoes where id = ${id}`
  )[0]!;

/** Ficha com o término `terminoDias` a partir de hoje (início = término − 12 meses) e as ações do 1º ano. */
const nova = async (
  n: number,
  o: { mentoria?: string; status?: string; terminoDias?: number; resp?: string | null } = {},
) => {
  const d = o.terminoDias ?? 20;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', ${o.mentoria ?? 'RDV'}, ${o.status ?? 'ATIVO'},
      ((${HOJE}::date + ${d}::int) - interval '12 months')::date, ${HOJE}::date + ${d}::int,
      ${o.resp === undefined ? ACOMP : o.resp})
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício R${n}`}, ${`mentorado ficticio r${n}`})`;
  await owner`select mentoria_gerar_acoes(${i!.id}::uuid, ${HOJE}::date)`;
  return i!.id;
};

const renovar = async (u: string, id: string, mentoria: string, data?: string) => {
  const { version } = await ler(id);
  const [r] = await q<{ v: number }>(
    u,
    sql`select mentoria_renovar(${id}::uuid, ${version}::int, ${mentoria}::text, ${data ?? HOJE}::date) as v`,
  );
  return r!.v;
};

const desfazer = async (u: string, id: string) => {
  const { version } = await ler(id);
  const [r] = await q<{ v: number }>(
    u,
    sql`select mentoria_renovacao_desfazer(${id}::uuid, ${version}::int) as v`,
  );
  return r!.v;
};

const acoes = (id: string) =>
  owner<{ id: string; mes: number; mentoria: string; status: string }[]>`
    select a.id, a.mes, m.mentoria, a.status from mentoria_acoes a
    join mentoria_plano_modelo m on m.id = a.plano_modelo_id
    where a.inscricao_id = ${id} order by m.mentoria, a.mes, a.foco`;

const renovacoes = (id: string) =>
  owner<
    {
      id: string;
      ano: number;
      data: string;
      mentoria_anterior: string;
      mentoria_nova: string;
      termino_anterior: string;
      termino_novo: string;
      status_anterior: string;
      concluida_em_anterior: Date | null;
      acoes: string[];
      registrada_por: string | null;
    }[]
  >`select id, ano, data::text, mentoria_anterior, mentoria_nova, termino_anterior::text, termino_novo::text,
      status_anterior, concluida_em_anterior, acoes, registrada_por
    from mentoria_renovacoes where inscricao_id = ${id} order by ano`;

const historico = (id: string, tipo: string) =>
  owner<{ campos: string[]; ator_id: string | null }[]>`
    select campos, ator_id from mentoria_historico where inscricao_id = ${id} and tipo = ${tipo}
    order by quando`;

const maisMeses = async (data: string, meses: number) =>
  (
    await owner<
      { d: string }[]
    >`select (${data}::date + make_interval(months => ${meses}))::date::text as d`
  )[0]!.d;

beforeAll(async () => {
  HOJE = (
    await owner<{ d: string }[]>`select (now() at time zone 'America/Sao_Paulo')::date::text as d`
  )[0]!.d;
  await owner`delete from mentoria_perfis where user_id like 'rn-%'`;
  await owner`delete from "user" where id like 'rn-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DIRETOR}, 'Diretor Rn', 'diretor@rn.test', 'DIRETOR', false, false),
      (${DUDA}, 'Duda Rn', 'duda@rn.test', 'ACOMPANHAMENTO', false, false),
      (${ACOMP}, 'Acomp Rn', 'acomp@rn.test', 'ACOMPANHAMENTO', false, false),
      (${CART}, 'Cart Rn', 'cart@rn.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op Rn', 'op@rn.test', 'ACOMPANHAMENTO', false, false),
      (${ESPEC}, 'Espec Rn', 'espec@rn.test', 'ACOMPANHAMENTO', false, false),
      (${MENTOR}, 'Mentor Rn', 'mentor@rn.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', true), (${ACOMP}, 'ACOMPANHAMENTO', false),
      (${CART}, 'ACOMPANHAMENTO', false), (${OPERACAO}, 'OPERACAO', false),
      (${ESPEC}, 'ESPECIALISTA', false), (${MENTOR}, 'MENTOR', false)`;
  await owner`update area_membros set alcance = 'CARTEIRA' where user_id = ${CART}`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'rn-%'`;
  await owner`delete from "user" where id like 'rn-%'`;
  await closeTestConnections();
});

describe('renovar', () => {
  it('RDV → 2M: término + 12 meses, mentoria nova, ações só do novo ano, histórico só com nomes', async () => {
    const id = await nova(1);
    const antes = await ler(id);
    expect((await acoes(id)).filter((a) => a.mentoria === 'RDV')).toHaveLength(12);

    const v = await renovar(DUDA, id, '2M');
    const depois = await ler(id);
    expect(v).toBe(antes.version + 1);
    expect(depois.version).toBe(v);
    expect(depois.mentoria).toBe('2M');
    expect(depois.status).toBe('ATIVO');
    expect(depois.termino_previsto).toBe(await maisMeses(antes.termino_previsto!, 12));

    // As 12 do RDV ficam; da 2M só os meses do novo ano (13 a 25: o 25 cai no próprio término, como o 13 no 1º ano).
    const todas = await acoes(id);
    expect(todas.filter((a) => a.mentoria === 'RDV')).toHaveLength(12);
    const da2m = todas.filter((a) => a.mentoria === '2M');
    expect(da2m.map((a) => a.mes)).toEqual([13, 13, 19, 25]);
    expect(da2m.every((a) => a.status === 'PENDENTE')).toBe(true);

    const [r] = await renovacoes(id);
    expect(r).toMatchObject({
      ano: 2,
      data: HOJE,
      mentoria_anterior: 'RDV',
      mentoria_nova: '2M',
      termino_anterior: antes.termino_previsto,
      termino_novo: depois.termino_previsto,
      status_anterior: 'ATIVO',
      registrada_por: DUDA,
    });
    expect([...r!.acoes].sort()).toEqual(da2m.map((a) => a.id).sort());

    const h = await historico(id, 'inscricao.renovada');
    expect(h).toEqual([{ campos: ['terminoPrevisto', 'mentoria', 'acoes'], ator_id: DUDA }]);
  });

  it('mesma mentoria: só o término anda (o RDV não tem nada depois do 12º mês)', async () => {
    const id = await nova(1);
    await renovar(ACOMP, id, 'RDV');
    expect((await ler(id)).mentoria).toBe('RDV');
    expect(await acoes(id)).toHaveLength(12);
    expect((await renovacoes(id))[0]!.acoes).toEqual([]);
    expect((await historico(id, 'inscricao.renovada'))[0]!.campos).toEqual(['terminoPrevisto']);
  });

  it('Concluído volta a Ativo; a renovação guarda o status e a data de antes', async () => {
    const id = await nova(1, { terminoDias: -10 });
    await q(DUDA, sql`update mentoria_inscricoes set status = 'CONCLUIDO' where id = ${id}::uuid`);
    const concluida = await ler(id);
    expect(concluida.concluida_em).toBeInstanceOf(Date);

    await renovar(DUDA, id, 'RDV');
    const depois = await ler(id);
    expect(depois.status).toBe('ATIVO');
    expect(depois.concluida_em).toBeNull();
    const [r] = await renovacoes(id);
    expect(r!.status_anterior).toBe('CONCLUIDO');
    expect(r!.concluida_em_anterior?.getTime()).toBe(concluida.concluida_em!.getTime());
    expect((await historico(id, 'inscricao.renovada'))[0]!.campos).toEqual([
      'terminoPrevisto',
      'status',
    ]);
  });

  it('2ª renovação: ano 3, gera a partir do mês 25 e não repete o que já existe', async () => {
    const id = await nova(1, { mentoria: '2M' });
    const inicial = await ler(id);
    // 1º ano da 2M já nasce com os do mês 13 (data = término).
    expect((await acoes(id)).map((a) => a.mes)).toEqual([1, 1, 4, 7, 7, 10, 13, 13]);
    await renovar(DUDA, id, '2M');
    expect((await renovacoes(id))[0]!.acoes).toHaveLength(2); // 19 e 25
    await renovar(DUDA, id, '2M');
    const rs = await renovacoes(id);
    expect(rs.map((r) => r.ano)).toEqual([2, 3]);
    expect((await ler(id)).termino_previsto).toBe(await maisMeses(inicial.termino_previsto!, 24));
    const criadas = (await acoes(id)).filter((a) => rs[1]!.acoes.includes(a.id));
    expect(criadas.map((a) => a.mes)).toEqual([37]);
  });

  it('recusa versão velha, status fora de Ativo/Concluído, sem término, data e mentoria fora da regra', async () => {
    const id = await nova(1);
    const { version } = await ler(id);
    const chamar = (u: string, insc: string, v: number, m: string, d: string) =>
      q(u, sql`select mentoria_renovar(${insc}::uuid, ${v}::int, ${m}::text, ${d}::date)`);

    expect((await pgError(chamar(DUDA, id, version - 1, 'RDV', HOJE))).code).toBe('P0409');
    const futura = await pgError(chamar(DUDA, id, version, 'RDV', await dia(1)));
    expect(futura.code).toBe('22023');
    expect(futura.message).toBe(
      'A data da renovação não pode ser futura nem de mais de 1 ano atrás.',
    );
    expect((await pgError(chamar(DUDA, id, version, 'RDV', await dia(-367)))).code).toBe('22023');
    expect((await pgError(chamar(DUDA, id, version, 'XYZ', HOJE))).code).toBe('22023');

    for (const status of ['ONBOARDING', 'PAUSADO', 'CANCELADO', 'RENOVADO']) {
      await owner`update mentoria_inscricoes set status = ${status} where id = ${id}`;
      const e = await pgError(chamar(DUDA, id, version, 'RDV', HOJE));
      expect({ status, code: e.code, message: e.message }).toEqual({
        status,
        code: '22023',
        message: 'Só ficha ativa ou concluída pode ser renovada.',
      });
    }
    await owner`update mentoria_inscricoes set status = 'ATIVO', termino_previsto = null where id = ${id}`;
    expect((await pgError(chamar(DUDA, id, version, 'RDV', HOJE))).code).toBe('22023');
    expect(await renovacoes(id)).toEqual([]);
  });

  it('a data pode ser de até 1 ano atrás', async () => {
    const id = await nova(1);
    await renovar(DUDA, id, 'RDV', await dia(-365));
    expect((await renovacoes(id))[0]!.data).toBe(await dia(-365));
  });
});

describe('quem renova', () => {
  it('Diretoria, Admin e Acompanhamento renovam', async () => {
    for (const u of [DIRETOR, DUDA, ACOMP]) {
      const id = await nova(1);
      await renovar(u, id, 'RDV');
      expect((await renovacoes(id))[0]!.registrada_por).toBe(u);
    }
  });

  it('"só a carteira" renova só a carteira dela', async () => {
    const dela = await nova(1, { resp: CART });
    const outra = await nova(2);
    await renovar(CART, dela, 'RDV');
    expect(await renovacoes(dela)).toHaveLength(1);
    expect((await pgError(renovar(CART, outra, 'RDV'))).code).toBe('42501');
    expect(await renovacoes(outra)).toEqual([]);
  });

  it('Operação, Especialista e Mentor não renovam (42501 = 404 na API)', async () => {
    const id = await nova(1);
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${id}, 'POSICIONAMENTO', ${ESPEC}, now() - interval '2 hours')`;
    for (const u of [OPERACAO, ESPEC, MENTOR]) {
      expect({ u, code: (await pgError(renovar(u, id, 'RDV'))).code }).toEqual({
        u,
        code: '42501',
      });
    }
    expect(await renovacoes(id)).toEqual([]);
  });

  it('npac_app não grava na tabela nem forja o histórico da renovação', async () => {
    const id = await nova(1);
    const ins = await pgError(
      q(
        DUDA,
        sql`insert into mentoria_renovacoes (inscricao_id, ano, data, mentoria_anterior, mentoria_nova,
          termino_anterior, termino_novo, status_anterior)
          values (${id}::uuid, 2, current_date, 'RDV', 'RDV', current_date, current_date + 365, 'ATIVO')`,
      ),
    );
    expect(ins.code).toBe('42501');
    await renovar(DUDA, id, 'RDV');
    expect(
      (
        await pgError(
          q(DUDA, sql`update mentoria_renovacoes set ano = 9 where inscricao_id = ${id}::uuid`),
        )
      ).code,
    ).toBe('42501');
    expect(
      (
        await pgError(
          q(DUDA, sql`delete from mentoria_renovacoes where inscricao_id = ${id}::uuid`),
        )
      ).code,
    ).toBe('42501');
    for (const tipo of ['inscricao.renovada', 'inscricao.renovacao_desfeita']) {
      const e = await pgError(
        q(
          DUDA,
          sql`insert into mentoria_historico (inscricao_id, ator_id, tipo, campos)
            values (${id}::uuid, ${DUDA}, ${tipo}, array['terminoPrevisto'])`,
        ),
      );
      expect({ tipo, code: e.code }).toEqual({ tipo, code: '42501' });
    }
  });
});

describe('desfazer', () => {
  it('a Admin desfaz: término, mentoria e status voltam; as ações que ela criou saem', async () => {
    const id = await nova(1);
    const antes = await ler(id);
    await renovar(ACOMP, id, '2M');
    const v = await desfazer(DUDA, id);
    const depois = await ler(id);
    expect(depois).toMatchObject({
      mentoria: 'RDV',
      status: 'ATIVO',
      termino_previsto: antes.termino_previsto,
      version: v,
    });
    expect((await acoes(id)).map((a) => a.mentoria)).toEqual(Array(12).fill('RDV'));
    expect(await renovacoes(id)).toEqual([]);
    expect(await historico(id, 'inscricao.renovacao_desfeita')).toEqual([
      { campos: ['terminoPrevisto', 'mentoria', 'acoes'], ator_id: DUDA },
    ]);
  });

  it('volta a Concluído com a data de antes; o mês 13 que já existia fica', async () => {
    const id = await nova(1, { mentoria: '2M', terminoDias: -5 });
    await q(DUDA, sql`update mentoria_inscricoes set status = 'CONCLUIDO' where id = ${id}::uuid`);
    const concluida = await ler(id);
    const doPrimeiroAno = await acoes(id);
    await renovar(DUDA, id, '2M');
    await desfazer(DIRETOR, id);
    const depois = await ler(id);
    expect(depois.status).toBe('CONCLUIDO');
    expect(depois.concluida_em?.getTime()).toBe(concluida.concluida_em!.getTime());
    expect(await acoes(id)).toEqual(doPrimeiroAno);
  });

  it('só a última renovação', async () => {
    const id = await nova(1, { mentoria: '2M' });
    await renovar(DUDA, id, '2M');
    const depoisDa1 = await ler(id);
    await renovar(DUDA, id, '6M');
    await desfazer(DUDA, id);
    expect((await renovacoes(id)).map((r) => r.ano)).toEqual([2]);
    expect(await ler(id)).toMatchObject({
      mentoria: '2M',
      termino_previsto: depoisDa1.termino_previsto,
    });
    expect((await acoes(id)).filter((a) => a.mentoria === '6M')).toEqual([]);
  });

  it('pausa depois da renovação: o término volta só os 12 meses', async () => {
    const id = await nova(1);
    const antes = await ler(id);
    await renovar(DUDA, id, 'RDV');
    await owner`update mentoria_inscricoes set termino_previsto = termino_previsto + 10 where id = ${id}`;
    await desfazer(DUDA, id);
    const esperado = (
      await owner<{ d: string }[]>`select (${antes.termino_previsto}::date + 10)::text as d`
    )[0]!.d;
    expect((await ler(id)).termino_previsto).toBe(esperado);
  });

  it('recusa: sem renovação, ação do novo ano feita, ficha fora de Ativo, versão velha', async () => {
    const id = await nova(1);
    const sem = await pgError(desfazer(DUDA, id));
    expect(sem).toMatchObject({
      code: '22023',
      message: 'Esta ficha não tem renovação para desfazer.',
    });

    await renovar(DUDA, id, '2M');
    const [r] = await renovacoes(id);
    await owner`update mentoria_acoes set status = 'FEITA' where id = ${r!.acoes[0]!}`;
    const feita = await pgError(desfazer(DUDA, id));
    expect(feita).toMatchObject({
      code: '22023',
      message: 'Uma ação do novo ano já foi feita: a renovação não pode mais ser desfeita.',
    });
    await owner`update mentoria_acoes set status = 'PENDENTE' where id = ${r!.acoes[0]!}`;

    await owner`update mentoria_inscricoes set status = 'PAUSADO' where id = ${id}`;
    expect((await pgError(desfazer(DUDA, id))).code).toBe('22023');
    await owner`update mentoria_inscricoes set status = 'ATIVO' where id = ${id}`;

    const { version } = await ler(id);
    const velha = await pgError(
      q(DUDA, sql`select mentoria_renovacao_desfazer(${id}::uuid, ${version - 1}::int)`),
    );
    expect(velha.code).toBe('P0409');
    expect(await renovacoes(id)).toHaveLength(1);
  });

  it('só a Admin desfaz (Acompanhamento e Operação: 42501)', async () => {
    const id = await nova(1);
    await renovar(DUDA, id, 'RDV');
    for (const u of [ACOMP, CART, OPERACAO, ESPEC]) {
      expect({ u, code: (await pgError(desfazer(u, id))).code }).toEqual({ u, code: '42501' });
    }
    expect(await renovacoes(id)).toHaveLength(1);
  });
});

describe('status', () => {
  it('Renovado não é escolha manual; quem já está continua editável', async () => {
    const id = await nova(1);
    const e = await pgError(
      q(DUDA, sql`update mentoria_inscricoes set status = 'RENOVADO' where id = ${id}::uuid`),
    );
    expect(e).toMatchObject({ code: '22023', message: 'Para renovar, use Registrar renovação.' });
    const ins = await pgError(
      q(
        DUDA,
        sql`insert into mentoria_inscricoes (tipo, mentoria, status, responsavel_id)
          values ('INDIVIDUAL', 'RDV', 'RENOVADO', ${ACOMP})`,
      ),
    );
    expect(ins.code).toBe('22023');

    await owner`update mentoria_inscricoes set status = 'RENOVADO' where id = ${id}`;
    await q(
      DUDA,
      sql`update mentoria_inscricoes set status = 'RENOVADO', mentoria_variante = 'x' where id = ${id}::uuid`,
    );
    await q(DUDA, sql`update mentoria_inscricoes set status = 'ATIVO' where id = ${id}::uuid`);
    expect((await ler(id)).status).toBe('ATIVO');
  });

  it('Concluído grava a data ao marcar e apaga ao sair; quem nasce concluído fica sem data', async () => {
    const id = await nova(1);
    await q(DUDA, sql`update mentoria_inscricoes set status = 'CONCLUIDO' where id = ${id}::uuid`);
    const marcada = (await ler(id)).concluida_em;
    expect(marcada).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - marcada!.getTime())).toBeLessThan(60_000);
    // Outro campo não mexe na data.
    await q(
      DUDA,
      sql`update mentoria_inscricoes set status = 'CONCLUIDO', mentoria_variante = 'y'
      where id = ${id}::uuid`,
    );
    expect((await ler(id)).concluida_em?.getTime()).toBe(marcada!.getTime());
    await q(DUDA, sql`update mentoria_inscricoes set status = 'ATIVO' where id = ${id}::uuid`);
    expect((await ler(id)).concluida_em).toBeNull();

    const [n] = await q<{ concluida_em: Date | null }>(
      DUDA,
      sql`insert into mentoria_inscricoes (tipo, mentoria, status, responsavel_id)
        values ('INDIVIDUAL', 'RDV', 'CONCLUIDO', ${ACOMP}) returning concluida_em`,
    );
    expect(n!.concluida_em).toBeNull();
    // npac_app não escreve a coluna.
    expect(
      (
        await pgError(
          q(DUDA, sql`update mentoria_inscricoes set concluida_em = now() where id = ${id}::uuid`),
        )
      ).code,
    ).toBe('42501');
  });
});

describe('gerar ações depois de renovar', () => {
  it('o gerador de sempre não cria os meses dos anos que já passaram', async () => {
    const id = await nova(1);
    await renovar(DUDA, id, '2M');
    const antes = await acoes(id);
    const [r] = await owner<
      { n: number }[]
    >`select mentoria_gerar_acoes(${id}::uuid, ${HOJE}::date) as n`;
    expect(r!.n).toBe(0);
    expect(await acoes(id)).toEqual(antes);
    // Trocar o plano pela inscrição (2M → 6M) também corta no ano atual.
    await owner`update mentoria_inscricoes set mentoria = '6M' where id = ${id}`;
    await owner`select mentoria_trocar_plano(${id}::uuid, ${HOJE}::date)`;
    const de6m = (await acoes(id)).filter((a) => a.mentoria === '6M');
    expect(de6m.length).toBeGreaterThan(0);
    expect(de6m.every((a) => a.mes >= 13)).toBe(true);
  });
});

describe('aba Renovações', () => {
  type Item = {
    inscricao_id: string;
    nome: string;
    ano: number;
    termino_previsto: string;
    ultimo_mes_inicio: string;
    renovada_em: string | null;
    renovada_de: string | null;
    renovada_para: string | null;
    reuniao_status: string | null;
    reuniao_dia: string | null;
    interesse_renovar: boolean | null;
    responsavel_id: string | null;
    responsavel: string | null;
  };
  type Painel = { itens: Item[]; renovaram: number; nao_renovaram: number };
  const painel = async (u: string) =>
    (await q<{ p: Painel }>(u, sql`select mentoria_renovacoes_painel(${HOJE}::date) as p`))[0]!.p;

  let chegando = '';
  let longe = '';
  let passou = '';
  let renovada = '';
  let antiga = '';

  beforeEach(async () => {
    chegando = await nova(1, { terminoDias: 80 });
    longe = await nova(2, { terminoDias: 120 });
    passou = await nova(3, { terminoDias: -5, resp: CART });
    await nova(4, { terminoDias: 30, status: 'PAUSADO' });
    await nova(5, { terminoDias: 30, status: 'CANCELADO' });
    await nova(6, { terminoDias: 30, status: 'ONBOARDING' });
    renovada = await nova(7, { terminoDias: 10 });
    await renovar(DUDA, renovada, '2M', await dia(-10));
    antiga = await nova(8, { terminoDias: 10 });
    await renovar(DUDA, antiga, 'RDV', await dia(-70));
    // Concluídos: com data dentro de 12 meses (conta), sem data e de 13 meses atrás (não contam).
    const c1 = await nova(9, { status: 'CONCLUIDO' });
    await owner`update mentoria_inscricoes set concluida_em = now() - interval '30 days' where id = ${c1}`;
    await nova(10, { status: 'CONCLUIDO' });
    const c3 = await nova(11, { status: 'CONCLUIDO' });
    await owner`update mentoria_inscricoes set concluida_em = now() - interval '13 months' where id = ${c3}`;
    // Renovação de 13 meses atrás não conta.
    await owner`insert into mentoria_renovacoes (inscricao_id, ano, data, mentoria_anterior, mentoria_nova,
      termino_anterior, termino_novo, status_anterior)
      values (${c3}, 2, ${HOJE}::date - interval '13 months', 'RDV', 'RDV', '2020-01-01', '2021-01-01', 'ATIVO')`;
  });

  it('lista: último mês nos próximos 60 dias ou já começou, e quem renovou nos últimos 60 dias', async () => {
    const p = await painel(DUDA);
    expect(p.itens.map((i) => i.inscricao_id)).toEqual([passou, chegando, renovada]);
    const c = p.itens.find((i) => i.inscricao_id === chegando)!;
    expect(c).toMatchObject({
      nome: 'Mentorado Fictício R1',
      ano: 1,
      termino_previsto: await dia(80),
      renovada_em: null,
      reuniao_status: null,
      responsavel_id: ACOMP,
      responsavel: 'Acomp Rn',
    });
    expect(c.ultimo_mes_inicio).toBe(await maisMeses(await dia(80), -1));
    expect(p.itens.find((i) => i.inscricao_id === renovada)).toMatchObject({
      ano: 2,
      renovada_em: await dia(-10),
      renovada_de: 'RDV',
      renovada_para: '2M',
    });
    expect(p.itens.some((i) => [longe, antiga].includes(i.inscricao_id))).toBe(false);
  });

  it('números: renovações e Concluídos dos últimos 12 meses', async () => {
    const p = await painel(DUDA);
    expect(p.renovaram).toBe(2);
    expect(p.nao_renovaram).toBe(1);
  });

  it('reunião: a de Renovação mais recente do ciclo atual, sem as remarcadas', async () => {
    // Do ciclo anterior (antes de término − 12 meses): não conta.
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status, interesse_renovar)
      values (${chegando}, 'RENOVACAO', ${ACOMP}, (${HOJE}::date + 80 - interval '13 months')::timestamp,
        'REALIZADA', false)`;
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status, interesse_renovar)
      values (${chegando}, 'RENOVACAO', ${ACOMP}, now() - interval '3 days', 'REALIZADA', true),
        (${chegando}, 'RENOVACAO', ${ACOMP}, now() + interval '1 day', 'REMARCADA', null),
        (${chegando}, 'POSICIONAMENTO', ${ACOMP}, now() + interval '2 days', 'AGENDADA', null),
        (${passou}, 'RENOVACAO', ${ACOMP}, now() - interval '20 days', 'FALTOU', null)`;
    const p = await painel(DUDA);
    expect(p.itens.find((i) => i.inscricao_id === chegando)).toMatchObject({
      reuniao_status: 'REALIZADA',
      interesse_renovar: true,
      reuniao_dia: await dia(-3),
    });
    expect(p.itens.find((i) => i.inscricao_id === passou)).toMatchObject({
      reuniao_status: 'FALTOU',
      interesse_renovar: null,
    });
  });

  it('quem vê: Admin e Acompanhamento todas; "só a carteira" a dela; os outros 42501', async () => {
    expect((await painel(DIRETOR)).itens).toHaveLength(3);
    expect((await painel(ACOMP)).itens).toHaveLength(3);
    const cart = await painel(CART);
    expect(cart.itens.map((i) => i.inscricao_id)).toEqual([passou]);
    expect(cart.renovaram).toBe(0);
    expect(cart.nao_renovaram).toBe(0);
    for (const u of [OPERACAO, ESPEC, MENTOR]) {
      expect({ u, code: (await pgError(painel(u))).code }).toEqual({ u, code: '42501' });
    }
  });

  it('a tabela: lê quem vê a inscrição (a Operação vê o selo na ficha)', async () => {
    const conta = async (u: string) =>
      (await q<{ n: number }>(u, sql`select count(*)::int as n from mentoria_renovacoes`))[0]!.n;
    expect(await conta(DUDA)).toBe(3);
    expect(await conta(OPERACAO)).toBe(3);
    expect(await conta(CART)).toBe(0);
    expect(await conta(ESPEC)).toBe(0);
    expect(await conta(MENTOR)).toBe(0);
  });
});
