import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'p-diretor';
const DUDA = 'p-duda';
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

type Acao = {
  id: string;
  mes: number;
  reuniao_tipo: string | null;
  data_prevista: string;
  data_limite: string;
  responsavel_perfil: string;
  responsavel_id: string | null;
  anterior_ao_sistema: boolean;
  foco: string;
};

const nova = async (
  mentoria: string,
  inicio: string | null,
  extra: { importada?: boolean; responsavel?: string; termino?: string } = {},
) => {
  const termino =
    extra.termino ?? (inicio ? `${Number(inicio.slice(0, 4)) + 1}${inicio.slice(4)}` : null);
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto,
      importada, responsavel_id)
    values ('INDIVIDUAL', ${mentoria}, 'ATIVO', ${inicio}, ${termino},
      ${extra.importada ?? false}, ${extra.responsavel ?? null})
    returning id`;
  return i!.id;
};

const gerar = (id: string, hoje = '2026-01-01', usuario = DUDA) =>
  withUser(db, usuario, (tx) =>
    tx.execute(sql`select mentoria_gerar_acoes(${id}::uuid, ${hoje}::date)`),
  );

const acoes = (id: string) => owner<Acao[]>`
  select id, mes, reuniao_tipo, to_char(data_prevista, 'YYYY-MM-DD') as data_prevista,
    to_char(data_limite, 'YYYY-MM-DD') as data_limite, responsavel_perfil, responsavel_id,
    anterior_ao_sistema, foco
  from mentoria_acoes where inscricao_id = ${id} order by mes, reuniao_tipo nulls last`;

const dataPrevista = async (inicio: string, mes: number, dias: number) => {
  const [r] = await owner<{ d: string }[]>`
    select to_char(mentoria_data_prevista(${inicio}::date, ${mes}::int, ${dias}::int), 'YYYY-MM-DD') as d`;
  return r!.d;
};

const mesJornada = async (id: string, hoje: string) => {
  const [r] = await owner<{ m: number | null }[]>`
    select mentoria_mes_jornada(${id}::uuid, ${hoje}::date) as m`;
  return r!.m;
};

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'p-%'`;
  await owner`delete from "user" where id like 'p-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DIRETOR}, 'Diretor P', 'diretor@p.test', 'DIRETOR', false, false),
      (${DUDA}, 'Duda P', 'duda@p.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op P', 'op@p.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu P', 'manu@p.test', 'ACOMPANHAMENTO', false, false),
      (${LEO}, 'Leo P', 'leo@p.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', false),
      (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false),
      (${LEO}, 'MENTOR', false)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'p-%'`;
  await owner`delete from "user" where id like 'p-%'`;
  await closeTestConnections();
});

describe('calendário', () => {
  it('data prevista respeita o fim do mês', async () => {
    expect(await dataPrevista('2026-01-31', 1, 0)).toBe('2026-01-31');
    expect(await dataPrevista('2026-01-31', 2, 0)).toBe('2026-02-28');
    expect(await dataPrevista('2026-01-31', 13, 0)).toBe('2027-01-31');
    expect(await dataPrevista('2026-03-10', 2, 25)).toBe('2026-05-05');
  });

  it('mês da jornada depois do 12º continua calculando', async () => {
    const id = await nova('RDV', '2025-01-10');
    expect(await mesJornada(id, '2025-12-31')).toBe(12);
    expect(await mesJornada(id, '2026-01-10')).toBe(13);
    expect(await mesJornada(id, '2026-03-20')).toBe(15);
  });
});

describe('geração', () => {
  it('RDV gera 12 ações, com o mês 7 flexível', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    const a = await acoes(id);
    expect(a.map((x) => x.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const m7 = a.find((x) => x.mes === 7)!;
    expect(m7.reuniao_tipo).toBe('CARTOES_MILHAS');
    expect(m7.data_prevista).toBe('2026-07-01');
    expect(m7.data_limite).toBe('2026-07-31');
    expect(a.find((x) => x.mes === 5)!.responsavel_perfil).toBe('ESPECIALISTA');
    expect(a.find((x) => x.mes === 11)!.responsavel_perfil).toBe('OPERACAO');
  });

  it('2M gera reuniões em +0, +3, +6, +9, +12 e pulseiras só até o término', async () => {
    const id = await nova('2M', '2026-01-10');
    await gerar(id);
    const a = await acoes(id);
    expect(a.filter((x) => x.reuniao_tipo === 'TRIMESTRAL_2M').map((x) => x.data_prevista)).toEqual(
      ['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10', '2027-01-10'],
    );
    expect(a.filter((x) => x.reuniao_tipo === null).map((x) => x.mes)).toEqual([1, 7, 13]);
    expect(a).toHaveLength(8);
  });

  it('6M gera 12 reuniões mensais e as pulseiras do período', async () => {
    const id = await nova('6M', '2026-01-10');
    await gerar(id);
    const a = await acoes(id);
    expect(a.filter((x) => x.reuniao_tipo === 'MENSAL_6M')).toHaveLength(12);
    expect(a.filter((x) => x.reuniao_tipo === null).map((x) => x.mes)).toEqual([1, 7, 13]);
  });

  it('gerar duas vezes não duplica', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    await gerar(id);
    expect(await acoes(id)).toHaveLength(12);
  });

  it('sem início não gera nada', async () => {
    const id = await nova('RDV', null);
    await gerar(id);
    expect(await acoes(id)).toHaveLength(0);
  });

  it('importado: data passada nasce anterior_ao_sistema; futura, não', async () => {
    const id = await nova('RDV', '2026-01-01', { importada: true });
    await gerar(id, '2026-04-15');
    const a = await acoes(id);
    expect(a.find((x) => x.mes === 3)!.anterior_ao_sistema).toBe(true);
    expect(a.find((x) => x.mes === 5)!.anterior_ao_sistema).toBe(false);
  });

  it('cadastro normal não marca anterior_ao_sistema', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id, '2026-04-15');
    expect((await acoes(id)).every((x) => !x.anterior_ao_sistema)).toBe(true);
  });

  it('responsável: Acompanhamento segue a inscrição; os outros ficam com o perfil', async () => {
    const id = await nova('RDV', '2026-01-01', { responsavel: DUDA });
    await gerar(id);
    const a = await acoes(id);
    expect(a.find((x) => x.mes === 2)!.responsavel_id).toBe(DUDA);
    expect(a.find((x) => x.mes === 11)!.responsavel_id).toBeNull();
  });

  it('trocar o responsável da inscrição leva as pendentes do Acompanhamento', async () => {
    const id = await nova('RDV', '2026-01-01', { responsavel: DUDA });
    await gerar(id);
    await owner`update mentoria_acoes set status = 'FEITA' where inscricao_id = ${id} and mes = 2`;
    await owner`update mentoria_inscricoes set responsavel_id = ${DIRETOR} where id = ${id}`;
    const a = await acoes(id);
    expect(a.find((x) => x.mes === 2)!.responsavel_id).toBe(DUDA);
    expect(a.find((x) => x.mes === 3)!.responsavel_id).toBe(DIRETOR);
    expect(a.find((x) => x.mes === 11)!.responsavel_id).toBeNull();
  });

  it('modelo inativo não gera', async () => {
    const [m] = await owner<{ id: string }[]>`
      select id from mentoria_plano_modelo where mentoria = 'RDV' and mes = 3`;
    await owner`update mentoria_plano_modelo set ativo = false where id = ${m!.id}`;
    try {
      const id = await nova('RDV', '2026-01-01');
      await gerar(id);
      expect((await acoes(id)).map((x) => x.mes)).not.toContain(3);
    } finally {
      await owner`update mentoria_plano_modelo set ativo = true where id = ${m!.id}`;
    }
  });

  it('editar o modelo não reescreve ações criadas', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    const [m] = await owner<{ id: string; foco: string; dias_para_executar: number }[]>`
      select id, foco, dias_para_executar from mentoria_plano_modelo
      where mentoria = 'RDV' and mes = 3`;
    await owner`update mentoria_plano_modelo
      set foco = 'Foco editado', dias_para_executar = 9 where id = ${m!.id}`;
    try {
      const a = (await acoes(id)).find((x) => x.mes === 3)!;
      expect(a.foco).toBe(m!.foco);
      expect(a.data_prevista).toBe('2026-03-01');
      await withUser(db, DUDA, (tx) =>
        tx.execute(sql`select mentoria_recalcular_acoes(${id}::uuid, '2026-01-01'::date)`),
      );
      expect((await acoes(id)).find((x) => x.mes === 3)!.data_prevista).toBe('2026-03-01');
    } finally {
      await owner`update mentoria_plano_modelo
        set foco = ${m!.foco}, dias_para_executar = ${m!.dias_para_executar} where id = ${m!.id}`;
    }
  });
});

describe('atrasada', () => {
  const atrasada = async (id: string, mes: number, hoje: string) => {
    const [r] = await owner<{ a: boolean }[]>`
      select mentoria_acao_atrasada(status, anterior_ao_sistema, data_limite, ${hoje}::date) as a
      from mentoria_acoes where inscricao_id = ${id} and mes = ${mes}`;
    return r!.a;
  };

  it('FLEXIVEL só atrasa depois do fim do mês 7', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    expect(await atrasada(id, 7, '2026-07-15')).toBe(false);
    expect(await atrasada(id, 7, '2026-07-31')).toBe(false);
    expect(await atrasada(id, 7, '2026-08-01')).toBe(true);
  });

  it('ação comum atrasa depois da data; anterior ao sistema nunca', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    expect(await atrasada(id, 3, '2026-03-01')).toBe(false);
    expect(await atrasada(id, 3, '2026-03-02')).toBe(true);
    await owner`update mentoria_acoes set anterior_ao_sistema = true
      where inscricao_id = ${id} and mes = 3`;
    expect(await atrasada(id, 3, '2026-03-02')).toBe(false);
  });
});

describe('acesso', () => {
  it('Manu e Leo não geram ações', async () => {
    const id = await nova('RDV', '2026-01-01');
    expect((await pgError(gerar(id, '2026-01-01', MANU))).code).toBe('42501');
    expect((await pgError(gerar(id, '2026-01-01', LEO))).code).toBe('42501');
  });

  it('Operação gera ações: ela fecha o onboarding', async () => {
    const id = await nova('2M', '2026-01-01');
    await gerar(id, '2026-01-01', OPERACAO);
    expect(await acoes(id)).toHaveLength(8);
  });

  it('Operação não recalcula: correção é de Admin e Acompanhamento', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    const e = await pgError(
      withUser(db, OPERACAO, (tx) =>
        tx.execute(sql`select mentoria_recalcular_acoes(${id}::uuid, '2026-01-01'::date)`),
      ),
    );
    expect(e.code).toBe('42501');
  });

  it('npac_app não insere nem apaga ação, nem muda data', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    const [a] = await acoes(id);
    const tenta = (q: ReturnType<typeof sql>) =>
      pgError(withUser(db, DIRETOR, (tx) => tx.execute(q)));
    expect(
      (
        await tenta(
          sql`insert into mentoria_acoes (inscricao_id, plano_modelo_id, mes, foco, acao, gatilho, dias_para_executar, data_prevista, data_limite, responsavel_perfil)
            select inscricao_id, plano_modelo_id, 99, foco, acao, gatilho, 0, data_prevista, data_limite, responsavel_perfil
            from mentoria_acoes where id = ${a!.id}`,
        )
      ).code,
    ).toBe('42501');
    expect((await tenta(sql`delete from mentoria_acoes where id = ${a!.id}`)).code).toBe('42501');
    expect(
      (await tenta(sql`update mentoria_acoes set data_prevista = '2030-01-01' where id = ${a!.id}`))
        .code,
    ).toBe('42501');
  });

  it('Operação marca só as ações do próprio perfil', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    const a = await acoes(id);
    const marca = (acao: Acao) =>
      withUser(db, OPERACAO, (tx) =>
        tx.execute<{ id: string }>(
          sql`update mentoria_acoes set status = 'FEITA' where id = ${acao.id} returning id`,
        ),
      );
    expect(await marca(a.find((x) => x.mes === 11)!)).toHaveLength(1);
    expect(await marca(a.find((x) => x.mes === 2)!)).toHaveLength(0);
  });

  it('Acompanhamento e Diretoria marcam todas; Mentor não vê', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    const a = await acoes(id);
    for (const u of [DUDA, DIRETOR]) {
      const r = await withUser(db, u, (tx) =>
        tx.execute<{ id: string }>(
          sql`update mentoria_acoes set status = 'FEITA' where id = ${a[10]!.id} returning id`,
        ),
      );
      expect(r).toHaveLength(1);
    }
    const leo = await withUser(db, LEO, (tx) =>
      tx.execute<{ n: number }>(sql`select count(*)::int as n from mentoria_acoes`),
    );
    expect(leo[0]!.n).toBe(0);
  });

  it('só Admin escreve no modelo', async () => {
    const [m] = await owner<{ id: string; foco: string }[]>`
      select id, foco from mentoria_plano_modelo where mentoria = '2M' and mes = 1 limit 1`;
    const tenta = (u: string) =>
      withUser(db, u, (tx) =>
        tx.execute<{ id: string }>(
          sql`update mentoria_plano_modelo set foco = foco where id = ${m!.id} returning id`,
        ),
      );
    expect(await tenta(DUDA)).toHaveLength(0);
    expect(await tenta(OPERACAO)).toHaveLength(0);
    expect(await tenta(DIRETOR)).toHaveLength(1);
  });

  it('evidência da ação segue o dono', async () => {
    const id = await nova('RDV', '2026-01-01');
    await gerar(id);
    const a = await acoes(id);
    const m2 = a.find((x) => x.mes === 2)!;
    const m11 = a.find((x) => x.mes === 11)!;
    const edita = async (u: string, acao: Acao) => {
      const [r] = await withUser(db, u, (tx) =>
        tx.execute<{ ok: boolean }>(
          sql`select mentoria_midia_edita('ACAO_EVIDENCIA', ${acao.id}::uuid) as ok`,
        ),
      );
      return r!.ok;
    };
    expect(await edita(OPERACAO, m11)).toBe(true);
    expect(await edita(OPERACAO, m2)).toBe(false);
    expect(await edita(DUDA, m2)).toBe(true);
  });
});
