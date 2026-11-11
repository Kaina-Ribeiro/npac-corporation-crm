import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'e-diretor';
const DUDA = 'e-duda';
const OPERACAO = 'e-operacao';
const MANU = 'e-manu';
const MANU2 = 'e-manu2';
const LEO = 'e-leo';
const SDR = 'e-sdr';

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

let a: string; // inscrição com reunião da Manu
let b: string; // inscrição sem reunião da Manu

const novaInscricao = async (n: number) => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', '2026-01-10', '2027-01-10') returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  await owner`select mentoria_gerar_acoes(${i!.id}::uuid, '2026-01-01'::date)`;
  return i!.id;
};

const reuniao = async (inscricao: string, condutor: string | null, tipo = 'POSICIONAMENTO') => {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
    values (${inscricao}, ${tipo}, ${condutor}, now() - interval '2 hours') returning id`;
  return r!.id;
};

const inserirComo = (u: string, inscricao: string, condutor: string, tipo = 'POSICIONAMENTO') =>
  withUser(db, u, (tx) =>
    tx.execute(sql`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${inscricao}, ${tipo}, ${condutor}, now() + interval '1 day')`),
  );

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'e-%'`;
  await owner`delete from "user" where id like 'e-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DIRETOR}, 'Diretor E', 'diretor@e.test', 'DIRETOR', false, false),
      (${DUDA}, 'Duda E', 'duda@e.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op E', 'op@e.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu E', 'manu@e.test', 'ACOMPANHAMENTO', false, false),
      (${MANU2}, 'Manu2 E', 'manu2@e.test', 'ACOMPANHAMENTO', false, false),
      (${LEO}, 'Leo E', 'leo@e.test', 'ACOMPANHAMENTO', false, false),
      (${SDR}, 'Sdr E', 'sdr@e.test', 'SDR', true, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', true),
      (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false),
      (${MANU2}, 'ESPECIALISTA', false),
      (${LEO}, 'MENTOR', false)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  a = await novaInscricao(1);
  b = await novaInscricao(2);
  await reuniao(a, MANU);
  await reuniao(a, DUDA, 'ACOMP_2PME');
  await reuniao(b, DUDA, 'ACOMP_2PME');
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'e-%'`;
  await owner`delete from "user" where id like 'e-%'`;
  await closeTestConnections();
});

describe('Especialista', () => {
  it('vê só as inscrições com reunião conduzida por ela', async () => {
    const ids = await q<{ id: string }>(MANU, sql`select id from mentoria_inscricoes`);
    expect(ids.map((r) => r.id)).toEqual([a]);
    expect(await q(MANU2, sql`select id from mentoria_inscricoes`)).toHaveLength(0);
    const ve = await q<{ a: boolean; b: boolean }>(
      MANU,
      sql`select mentoria_ve(${a}::uuid) as a, mentoria_ve(${b}::uuid) as b`,
    );
    expect(ve[0]).toEqual({ a: true, b: false });
  });

  it('dentro da inscrição, vê só as reuniões dela', async () => {
    const rs = await q<{ conduzida_por: string }>(
      MANU,
      sql`select conduzida_por from mentoria_reunioes`,
    );
    expect(rs.map((r) => r.conduzida_por)).toEqual([MANU]);
    expect(await q(DUDA, sql`select id from mentoria_reunioes`)).toHaveLength(3);
    expect(await q(OPERACAO, sql`select id from mentoria_reunioes`)).toHaveLength(3);
  });

  it('cria a próxima reunião dela onde já tem acesso, nunca IDR nem de outra pessoa', async () => {
    await inserirComo(MANU, a, MANU);
    expect((await pgError(inserirComo(MANU, b, MANU))).code).toBe('42501');
    expect((await pgError(inserirComo(MANU, a, DUDA))).code).toBe('42501');
    expect((await pgError(inserirComo(MANU, a, MANU, 'IDR'))).code).toBe('42501');
  });

  it('edita só as reuniões dela', async () => {
    const minhas = await q<{ id: string }>(
      MANU,
      sql`update mentoria_reunioes set humor = 4 where inscricao_id = ${a} returning id`,
    );
    expect(minhas).toHaveLength(1);
    const [outra] = await owner<{ humor: number | null }[]>`
      select humor from mentoria_reunioes where conduzida_por = ${DUDA} and inscricao_id = ${a}`;
    expect(outra!.humor).toBeNull();
    // Passar a reunião para outra pessoa: o WITH CHECK recusa.
    expect(
      (
        await pgError(
          q(
            MANU,
            sql`update mentoria_reunioes set conduzida_por = ${DUDA} where inscricao_id = ${a}`,
          ),
        )
      ).code,
    ).toBe('42501');
  });

  it('marca a ação do mês 5 de quem é dela e não a de outro perfil', async () => {
    const m5 = await q<{ id: string }>(
      MANU,
      sql`update mentoria_acoes set itens_feitos = '{Posicionamento entregue}'
        where inscricao_id = ${a} and mes = 5 returning id`,
    );
    expect(m5).toHaveLength(1);
    const m4 = await q(
      MANU,
      sql`update mentoria_acoes set itens_feitos = '{}' where inscricao_id = ${a} and mes = 4 returning id`,
    );
    expect(m4).toHaveLength(0);
    const fora = await q(
      MANU,
      sql`update mentoria_acoes set itens_feitos = '{}' where inscricao_id = ${b} and mes = 5 returning id`,
    );
    expect(fora).toHaveLength(0);
  });

  it('excluir a reunião dela tira o acesso à ficha', async () => {
    await owner`delete from mentoria_reunioes where conduzida_por = ${MANU}`;
    expect(await q(MANU, sql`select id from mentoria_inscricoes`)).toHaveLength(0);
  });

  it('não registra contato e não exclui reunião', async () => {
    const contato = withUser(db, MANU, (tx) =>
      tx.execute(sql`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal)
        values (${a}, ${MANU}, now(), 'WHATSAPP')`),
    );
    expect((await pgError(contato)).code).toBe('42501');
    const [r] = await owner<{ id: string }[]>`
      select id from mentoria_reunioes where conduzida_por = ${MANU}`;
    const excluir = q(MANU, sql`select mentoria_excluir_reuniao(${r!.id}::uuid)`);
    expect((await pgError(excluir)).code).toBe('P0002');
  });
});

describe('demais perfis', () => {
  it('Mentor e cargo comercial não veem reuniões nem contatos', async () => {
    for (const u of [LEO, SDR]) {
      expect(await q(u, sql`select id from mentoria_reunioes`)).toHaveLength(0);
      expect(await q(u, sql`select id from mentoria_contatos`)).toHaveLength(0);
    }
  });

  it('npac_app não apaga reunião nem contato', async () => {
    for (const t of ['mentoria_reunioes', 'mentoria_contatos']) {
      const e = await pgError(q(DIRETOR, sql`delete from ${sql.raw(t)}`));
      expect(e.code).toBe('42501');
    }
  });

  it('contato vai em nome de quem está logado', async () => {
    const forjado = withUser(db, OPERACAO, (tx) =>
      tx.execute(sql`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal)
        values (${a}, ${DUDA}, now(), 'WHATSAPP')`),
    );
    expect((await pgError(forjado)).code).toBe('42501');
    await withUser(db, OPERACAO, (tx) =>
      tx.execute(sql`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal)
        values (${a}, ${OPERACAO}, now(), 'LIGACAO')`),
    );
    expect(await q(DUDA, sql`select id from mentoria_contatos`)).toHaveLength(1);
  });
});

describe('estados da reunião', () => {
  const mudar = (u: string, id: string, status: string) =>
    q(u, sql`update mentoria_reunioes set status = ${status} where id = ${id}::uuid returning id`);

  it('não volta de estado, não remarca por UPDATE e encerrada não muda', async () => {
    const id = await reuniao(b, DUDA, 'MENSAL_6M');
    await mudar(OPERACAO, id, 'LINK_ENVIADO');
    expect((await pgError(mudar(OPERACAO, id, 'CONFIRMADA'))).message).toContain('não volta');
    expect((await pgError(mudar(OPERACAO, id, 'REMARCADA'))).message).toContain('remarcar');
    await mudar(OPERACAO, id, 'FALTOU');
    expect((await pgError(mudar(OPERACAO, id, 'REALIZADA'))).message).toContain('encerrada');
  });

  it('realizada só depois do horário, conferido no banco', async () => {
    const [r] = await owner<{ id: string }[]>`
      insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${b}, 'MENSAL_6M', ${DUDA}, now() + interval '1 hour') returning id`;
    const e = await pgError(mudar(DUDA, r!.id, 'REALIZADA'));
    expect(e.message).toContain('ainda não aconteceu');
  });

  it('nasce agendada e com o autor de quem está logado', async () => {
    const e = await pgError(
      q(
        OPERACAO,
        sql`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status)
        values (${b}, 'IDR', ${LEO}, now(), 'REALIZADA')`,
      ),
    );
    expect(e.message).toContain('nasce agendada');
    const [r] = await q<{ criado_por: string }>(
      OPERACAO,
      sql`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, criado_por)
        values (${b}, 'IDR', ${LEO}, now(), ${DUDA}) returning criado_por`,
    );
    expect(r!.criado_por).toBe(OPERACAO);
  });
});
