import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// NPAC-60: cronograma do PME (desenho docs/superpowers/specs/2026-11-24-cronograma-design.md, §6 e §7).
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const ADMIN = 'cr-admin';
const ACOMP = 'cr-acomp';
const OPERACAO = 'cr-operacao';
const MANU = 'cr-manu'; // Especialista
const CART = 'cr-cart'; // Acompanhamento "só a carteira"

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
  withUser(db, id, async (tx) => [...(await tx.execute<T>(q))]);

let rdv = ''; // RDV da pessoa 1 (WhatsApp w1), com o 1º PME fechado
let doisM = ''; // 2M da pessoa 1 (mesmo WhatsApp), com o 1º PME aberto
let outra = ''; // RDV de outra pessoa (WhatsApp w2), na carteira da CART
let cicloRdv = '';
let cicloDoisM = '';
const itens: Record<string, string> = {};

const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

async function inscricao(mentoria: string, whats: string, email: string | null) {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, responsavel_id)
    values ('INDIVIDUAL', ${mentoria}, 'ATIVO', '2026-01-10', ${ACOMP}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm, whatsapp_idx, email_idx)
    values (${i!.id}, 1, 'Mentorado Fictício CR', 'mentorado ficticio cr', ${whats}, ${email})`;
  return i!.id;
}

async function ciclo(insc: string, numero: number, enviado: string) {
  const [c] = await owner<{ id: string }[]>`
    insert into mentoria_ciclos (inscricao_id, numero, enviado_em)
    values (${insc}, ${numero}, ${enviado}) returning id`;
  return c!.id;
}

/** Tarefa do cronograma pelo owner (sem RLS), com o prazo do ciclo. */
async function tarefaPme(insc: string, cicloId: string, item: string | null, bloco: string) {
  const [t] = await owner<{ id: string; version: number }[]>`
    insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, ordem, descricao, prazo,
      cronograma_bloco, cronograma_item_id)
    select ${insc}, 'PME', c.id, 5, 'cifrado', c.prazo, ${bloco}, ${item}
    from mentoria_ciclos c where c.id = ${cicloId}
    returning id, version`;
  return t!;
}

beforeAll(async () => {
  await owner`delete from mentoria_perfis where user_id like 'cr-%'`;
  await owner`delete from "user" where id like 'cr-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${ADMIN}, 'Admin CR', 'admin@cr.test', 'DIRETOR', false, false),
      (${ACOMP}, 'Acomp CR', 'acomp@cr.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op CR', 'op@cr.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu CR', 'manu@cr.test', 'ACOMPANHAMENTO', false, false),
      (${CART}, 'Cart CR', 'cart@cr.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${ACOMP}, 'ACOMPANHAMENTO', false), (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false), (${CART}, 'ACOMPANHAMENTO', false)`;
  await owner`update area_membros set alcance = 'CARTEIRA' where user_id = ${CART}`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_cronograma_itens`;
  for (const [k, bloco, texto] of [
    ['filme', 'FILME', 'Filme Fictício Um'],
    ['livro', 'LIVRO', 'Livro Fictício Um'],
    ['desafio', 'DESAFIO', 'Desafio Fictício Um'],
  ] as const) {
    const [r] = await owner<{ id: string }[]>`
      insert into mentoria_cronograma_itens (bloco, texto, texto_norm, ordem)
      values (${bloco}, ${texto}, ${texto.toLowerCase()}, 1) returning id`;
    itens[k] = r!.id;
  }
  rdv = await inscricao('RDV', 'w1', null);
  doisM = await inscricao('2M', 'w1', 'e9');
  outra = await inscricao('RDV', 'w2', null);
  await owner`update mentoria_inscricoes set responsavel_id = ${CART} where id = ${outra}`;
  cicloRdv = await ciclo(rdv, 1, '2026-02-01');
  await owner`update mentoria_ciclos set concluido_em = '2026-02-20' where id = ${cicloRdv}`;
  cicloDoisM = await ciclo(doisM, 1, hoje());
  await tarefaPme(rdv, cicloRdv, itens.filme!, 'FILME');
  await owner`insert into mentoria_cronograma_anteriores (inscricao_id, item_id, pme_numero, resultado)
    values (${rdv}, ${itens.livro!}, null, 'JA_TINHA'), (${outra}, ${itens.desafio!}, 2, 'RECEBIDO')`;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_cronograma_itens`;
  await owner`delete from mentoria_perfis where user_id like 'cr-%'`;
  await owner`delete from "user" where id like 'cr-%'`;
  await closeTestConnections();
});

describe('banco de itens e histórico da planilha (RLS)', () => {
  const conta = async (u: string, tabela: string) =>
    (
      await como<{ n: number }>(u, sql`select count(*)::int as n from ${sql.identifier(tabela)}`)
    )[0]!.n;

  it('Especialista lê 0 itens e 0 anteriores; os outros perfis leem', async () => {
    expect(await conta(MANU, 'mentoria_cronograma_itens')).toBe(0);
    expect(await conta(MANU, 'mentoria_cronograma_anteriores')).toBe(0);
    for (const u of [ADMIN, ACOMP, OPERACAO, CART])
      expect(await conta(u, 'mentoria_cronograma_itens')).toBe(3);
    expect(await conta(ADMIN, 'mentoria_cronograma_anteriores')).toBe(2);
    expect(await conta(OPERACAO, 'mentoria_cronograma_anteriores')).toBe(2);
  });

  it('"só a carteira" lê os anteriores só da carteira', async () => {
    const r = await como<{ inscricao_id: string }>(
      CART,
      sql`select inscricao_id from mentoria_cronograma_anteriores`,
    );
    expect(r.map((x) => x.inscricao_id)).toEqual([outra]);
  });

  it('só a Admin grava no banco; sem DELETE para ninguém', async () => {
    const ins = (u: string) =>
      como(
        u,
        sql`insert into mentoria_cronograma_itens (bloco, texto, texto_norm) values ('EAP', 'EAP X', 'eap x')`,
      );
    expect((await pgError(ins(OPERACAO))).code).toBe('42501');
    expect((await pgError(ins(ACOMP))).code).toBe('42501');
    await ins(ADMIN);
    const [criado] = await owner<{ criado_por: string }[]>`
      select criado_por from mentoria_cronograma_itens where texto = 'EAP X'`;
    expect(criado!.criado_por).toBe(ADMIN);
    const upd = await como(
      OPERACAO,
      sql`update mentoria_cronograma_itens set ativo = false where id = ${itens.filme!} returning id`,
    );
    expect(upd).toHaveLength(0);
    const ok = await como(
      ADMIN,
      sql`update mentoria_cronograma_itens set ativo = false where id = ${itens.filme!} returning id`,
    );
    expect(ok).toHaveLength(1);
    expect(
      (
        await pgError(
          como(ADMIN, sql`delete from mentoria_cronograma_itens where id = ${itens.filme!}`),
        )
      ).code,
    ).toBe('42501');
    expect((await pgError(como(ADMIN, sql`delete from mentoria_cronograma_anteriores`))).code).toBe(
      '42501',
    );
    // Mesmo texto no bloco: único.
    expect(
      (
        await pgError(
          como(
            ADMIN,
            sql`insert into mentoria_cronograma_itens (bloco, texto, texto_norm) values ('FILME', 'FILME FICTÍCIO UM', 'filme fictício um')`,
          ),
        )
      ).code,
    ).toBe('23505');
  });

  it('o npac_app não grava nos anteriores (só as funções da importação e do envio)', async () => {
    expect(
      (
        await pgError(
          como(
            ADMIN,
            sql`insert into mentoria_cronograma_anteriores (inscricao_id, item_id, resultado) values (${doisM}, ${itens.filme!}, 'RECEBIDO')`,
          ),
        )
      ).code,
    ).toBe('42501');
  });

  it('excluir a inscrição leva os anteriores dela', async () => {
    await withUser(db, ADMIN, (tx) =>
      tx.execute(sql`select mentoria_excluir_inscricao(${outra}::uuid)`),
    );
    const [r] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_cronograma_anteriores where inscricao_id = ${outra}`;
    expect(r!.n).toBe(0);
  });
});

describe('tarefas do cronograma', () => {
  it('origem PME exige o bloco, bloco só com origem PME, e o item não repete no ciclo', async () => {
    expect(
      (
        await pgError(owner`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao)
          values (${doisM}, 'PME', ${cicloDoisM}, 'cifrado')`)
      ).code,
    ).toBe('23514');
    expect(
      (
        await pgError(owner`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao,
            cronograma_bloco) values (${doisM}, 'EXTRA', ${cicloDoisM}, 'cifrado', 'FILME')`)
      ).code,
    ).toBe('23514');
    expect(
      (
        await pgError(owner`insert into mentoria_tarefas (inscricao_id, origem, descricao, cronograma_bloco)
          values (${doisM}, 'PME', 'cifrado', 'FILME')`)
      ).code,
    ).toBe('23514');
    await tarefaPme(doisM, cicloDoisM, itens.livro!, 'LIVRO');
    expect((await pgError(tarefaPme(doisM, cicloDoisM, itens.livro!, 'LIVRO'))).code).toBe('23505');
    // Item "só desta pessoa" (sem item do banco) pode repetir o bloco.
    await tarefaPme(doisM, cicloDoisM, null, 'DESAFIO');
    await tarefaPme(doisM, cicloDoisM, null, 'DESAFIO');
  });

  it('o bloco da tarefa é o do item do banco', async () => {
    const t = await tarefaPme(doisM, cicloDoisM, itens.livro!, 'FILME');
    const [r] = await owner<{ b: string }[]>`
      select cronograma_bloco as b from mentoria_tarefas where id = ${t.id}`;
    expect(r!.b).toBe('LIVRO');
  });

  it('a Operação cria tarefa do cronograma (envia o PME) e não marca o resultado', async () => {
    const [t] = await como<{ id: string }>(
      OPERACAO,
      sql`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, ordem, descricao, prazo,
          cronograma_bloco, cronograma_item_id)
        values (${doisM}, 'PME', ${cicloDoisM}, 3, 'cifrado', ${hoje()}::date, 'LIVRO', ${itens.livro!})
        returning id`,
    );
    const marcou = await como(
      OPERACAO,
      sql`update mentoria_tarefas set status = 'FEITA' where id = ${t!.id} returning id`,
    );
    expect(marcou).toHaveLength(0);
    const ok = await como(
      ACOMP,
      sql`update mentoria_tarefas set status = 'FEITA' where id = ${t!.id} returning id`,
    );
    expect(ok).toHaveLength(1);
    // A Especialista não vê nem cria.
    expect(
      await como(MANU, sql`select id from mentoria_tarefas where origem = 'PME'`),
    ).toHaveLength(0);
    expect(
      (
        await pgError(
          como(
            MANU,
            sql`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao, cronograma_bloco)
              values (${doisM}, 'PME', ${cicloDoisM}, 'cifrado', 'EAP')`,
          ),
        )
      ).code,
    ).toBe('42501');
    // "Só a carteira" não cria fora da carteira.
    expect(
      (
        await pgError(
          como(
            CART,
            sql`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao, cronograma_bloco)
              values (${doisM}, 'PME', ${cicloDoisM}, 'cifrado', 'EAP')`,
          ),
        )
      ).code,
    ).toBe('42501');
  });
});

describe('mentoria_cronograma_recebidos', () => {
  type Linha = {
    item_id: string;
    bloco: string;
    pme_numero: number | null;
    resultado: string;
    inscricao_id: string;
    mentoria: string;
    propria: boolean;
  };
  const recebidos = (u: string, insc: string) =>
    como<Linha>(
      u,
      sql`select * from mentoria_cronograma_recebidos(${insc}::uuid) order by bloco, propria desc, inscricao_id`,
    );

  it('a 2M traz o que a mesma pessoa recebeu no RDV (WhatsApp igual) e não o de outra pessoa', async () => {
    const r = await recebidos(ADMIN, doisM);
    expect(
      r.map((x) => [
        x.item_id,
        x.bloco,
        x.pme_numero,
        x.resultado,
        x.inscricao_id,
        x.mentoria,
        x.propria,
      ]),
    ).toEqual([
      [itens.filme, 'FILME', 1, 'PENDENTE', rdv, 'RDV', false],
      [itens.livro, 'LIVRO', null, 'JA_TINHA', rdv, 'RDV', false],
    ]);
  });

  it('e-mail igual também liga; a própria inscrição vem como própria', async () => {
    await owner`update mentoria_pessoas set email_idx = 'e9' where inscricao_id = ${outra}`;
    await tarefaPme(doisM, cicloDoisM, itens.desafio!, 'DESAFIO');
    const r = await recebidos(ACOMP, doisM);
    expect(r.map((x) => [x.bloco, x.inscricao_id, x.propria])).toEqual([
      ['DESAFIO', doisM, true],
      ['DESAFIO', outra, false],
      ['FILME', rdv, false],
      ['LIVRO', rdv, false],
    ]);
  });

  it('PLANEJADO que já saiu num envio não aparece duas vezes', async () => {
    const t = await tarefaPme(doisM, cicloDoisM, itens.desafio!, 'DESAFIO');
    await owner`insert into mentoria_cronograma_anteriores (inscricao_id, item_id, pme_numero, resultado, tarefa_id)
      values (${doisM}, ${itens.desafio!}, 1, 'PLANEJADO', ${t.id})`;
    const r = (await recebidos(ADMIN, doisM)).filter((x) => x.bloco === 'DESAFIO');
    expect(r.map((x) => x.resultado)).toEqual(['PENDENTE']);
  });

  it('respeita a RLS: "só a carteira" não enxerga as inscrições de fora; a Especialista nada', async () => {
    await owner`update mentoria_pessoas set whatsapp_idx = 'w1' where inscricao_id = ${outra}`;
    expect((await recebidos(CART, outra)).map((x) => x.inscricao_id)).toEqual([outra]);
    expect(await recebidos(MANU, doisM)).toEqual([]);
    const r = await owner<{ prosecdef: boolean; config: string[] }[]>`
      select prosecdef, proconfig as config from pg_proc where proname = 'mentoria_cronograma_recebidos'`;
    expect(r[0]!.prosecdef).toBe(false);
    expect(r[0]!.config).toContain('jit=off');
  });
});

describe('mentoria_cronograma_remover', () => {
  const remover = (u: string, id: string, version: number) =>
    withUser(db, u, (tx) =>
      tx.execute(sql`select mentoria_cronograma_remover(${id}::uuid, ${version}::int)`),
    );

  it('tira a tarefa pendente, devolve o PLANEJADO e grava o histórico', async () => {
    const t = await tarefaPme(doisM, cicloDoisM, itens.desafio!, 'DESAFIO');
    await owner`insert into mentoria_cronograma_anteriores (inscricao_id, item_id, pme_numero, resultado, tarefa_id)
      values (${doisM}, ${itens.desafio!}, 1, 'PLANEJADO', ${t.id})`;
    await remover(OPERACAO, t.id, t.version);
    const [n] = await owner<
      { n: number }[]
    >`select count(*)::int as n from mentoria_tarefas where id = ${t.id}`;
    expect(n!.n).toBe(0);
    const [a] = await owner<{ tarefa_id: string | null }[]>`
      select tarefa_id from mentoria_cronograma_anteriores where inscricao_id = ${doisM}`;
    expect(a!.tarefa_id).toBeNull();
    const h = await owner<{ tipo: string; campos: string[]; ator_id: string }[]>`
      select tipo, campos, ator_id from mentoria_historico where inscricao_id = ${doisM}`;
    expect(h.map((x) => [x.tipo, x.campos, x.ator_id])).toEqual([
      ['pme.cronograma_removido', ['DESAFIO'], OPERACAO],
    ]);
  });

  it('recusa tarefa feita, com comprovante, de ciclo fechado, de outra origem e versão velha', async () => {
    const feita = await tarefaPme(doisM, cicloDoisM, itens.desafio!, 'DESAFIO');
    await owner`update mentoria_tarefas set status = 'FEITA' where id = ${feita.id}`;
    expect((await pgError(remover(ADMIN, feita.id, feita.version))).code).toBe('22023');

    const comp = await tarefaPme(doisM, cicloDoisM, null, 'EAP');
    await owner`update mentoria_tarefas set comprovante_midia_id = gen_random_uuid() where id = ${comp.id}`;
    expect((await pgError(remover(ADMIN, comp.id, comp.version))).code).toBe('22023');

    const fechada = await tarefaPme(rdv, cicloRdv, null, 'EAP');
    expect((await pgError(remover(ADMIN, fechada.id, fechada.version))).code).toBe('22023');

    const [extra] = await owner<{ id: string; version: number }[]>`
      insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao)
      values (${doisM}, 'EXTRA', ${cicloDoisM}, 'cifrado') returning id, version`;
    expect((await pgError(remover(ADMIN, extra!.id, extra!.version))).code).toBe('22023');

    const velha = await tarefaPme(doisM, cicloDoisM, null, 'FILME');
    expect((await pgError(remover(ADMIN, velha.id, velha.version + 1))).code).toBe('P0409');
  });

  it('a Especialista não acha (P0002); "só a carteira" fora da carteira também não', async () => {
    const t = await tarefaPme(doisM, cicloDoisM, null, 'FILME');
    expect((await pgError(remover(MANU, t.id, t.version))).code).toBe('P0002');
    expect((await pgError(remover(CART, t.id, t.version))).code).toBe('P0002');
    expect((await pgError(remover(ADMIN, crypto.randomUUID(), 1))).code).toBe('P0002');
  });
});

describe('Fila e push não cobram item do cronograma (C10)', () => {
  it('tarefa PME pendente no prazo fica fora; a extra do mesmo ciclo continua', async () => {
    const pme = await tarefaPme(doisM, cicloDoisM, itens.livro!, 'LIVRO');
    const [extra] = await owner<{ id: string }[]>`
      insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao, prazo)
      select ${doisM}, 'EXTRA', c.id, 'cifrado', c.prazo from mentoria_ciclos c
      where c.id = ${cicloDoisM} returning id`;
    const [p] = await owner<{ prazo: string }[]>`
      select to_char(prazo, 'YYYY-MM-DD') as prazo from mentoria_ciclos where id = ${cicloDoisM}`;
    const agora = `${p!.prazo}T10:00:00-03:00`;
    const fila = await como<{ chave: string }>(
      ADMIN,
      sql`select chave from mentoria_fila(${agora}::timestamptz) where tipo = 'COBRANCA'`,
    );
    expect(fila.map((l) => l.chave)).toEqual([`cobranca:${extra!.id}`]);
    const avisos = await owner<{ chave: string }[]>`
      select chave from mentoria_avisos_candidatos(${`${p!.prazo}T07:00:00-03:00`}::timestamptz)
      where chave like 'cobranca:%'`;
    expect(avisos.map((a) => a.chave)).toEqual([`cobranca:${extra!.id}`]);
    expect(fila.map((l) => l.chave)).not.toContain(`cobranca:${pme.id}`);
  });
});
