import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'v-diretor';
const DUDA = 'v-duda';
const OPERACAO = 'v-operacao';
const MANU = 'v-manu';
const LEO = 'v-leo';
const SEM_PERFIL = 'v-semperfil';
const SDR = 'v-sdr';

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

const um = async <T extends Record<string, unknown>>(id: string, q: ReturnType<typeof sql>) =>
  withUser(db, id, async (tx) => (await tx.execute<T>(q))[0]!);

const contarInscricoes = async (id: string) =>
  (await um<{ n: number }>(id, sql`select count(*)::int as n from mentoria_inscricoes`)).n;

let inscricao: string;
let pessoa: string;

const momentoEm = (usuario: string) =>
  withUser(db, usuario, (tx) =>
    tx.execute(
      sql`insert into mentoria_momento_inicial (inscricao_id, criado_por)
          values (${inscricao}, ${usuario})`,
    ),
  );

beforeAll(async () => {
  await owner`delete from "user" where id like 'v-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DIRETOR}, 'Diretor V', 'diretor@v.test', 'DIRETOR', false, false),
      (${DUDA}, 'Duda V', 'duda@v.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op V', 'op@v.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu V', 'manu@v.test', 'ACOMPANHAMENTO', false, false),
      (${LEO}, 'Leo V', 'leo@v.test', 'ACOMPANHAMENTO', false, false),
      (${SEM_PERFIL}, 'Sem V', 'sem@v.test', 'ACOMPANHAMENTO', false, false),
      (${SDR}, 'Sdr V', 'sdr@v.test', 'SDR', true, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', true),
      (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false),
      (${LEO}, 'MENTOR', false),
      (${SDR}, 'ACOMPANHAMENTO', true)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`update "user" set active = true where id like 'v-%'`;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status)
    values ('INDIVIDUAL', 'RDV', 'ONBOARDING') returning id`;
  inscricao = i!.id;
  const [p] = await owner<{ id: string }[]>`
    insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${inscricao}, 1, 'Mentorado Fictício 01', 'mentorado ficticio 01') returning id`;
  pessoa = p!.id;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id like 'v-%'`;
  await owner`delete from "user" where id like 'v-%'`;
  await closeTestConnections();
});

describe('perfis do módulo', () => {
  it('Diretoria é admin sem linha em perfis', async () => {
    const r = await um<{ admin: boolean; perfil: string | null }>(
      DIRETOR,
      sql`select mentoria_admin() as admin, mentoria_perfil() as perfil`,
    );
    expect(r).toEqual({ admin: true, perfil: null });
  });

  it('Acompanhamento com admin=true é admin e mantém o perfil', async () => {
    const r = await um<{ admin: boolean; perfil: string | null }>(
      DUDA,
      sql`select mentoria_admin() as admin, mentoria_perfil() as perfil`,
    );
    expect(r).toEqual({ admin: true, perfil: 'ACOMPANHAMENTO' });
  });

  it('cargo Acompanhamento sem perfil não vê nada', async () => {
    expect(await contarInscricoes(SEM_PERFIL)).toBe(0);
    expect(await contarInscricoes(DUDA)).toBe(1);
  });

  it('Mentor não vê nenhuma inscrição', async () => {
    expect(await contarInscricoes(LEO)).toBe(0);
    const r = await um<{ ve: boolean }>(LEO, sql`select mentoria_ve(${inscricao}::uuid) as ve`);
    expect(r.ve).toBe(false);
  });

  it('Especialista sem reunião não vê a inscrição', async () => {
    expect(await contarInscricoes(MANU)).toBe(0);
  });

  it('Operação escreve endereço, mas não momento inicial', async () => {
    await withUser(db, OPERACAO, (tx) =>
      tx.execute(
        sql`insert into mentoria_enderecos (inscricao_id, cep, origem)
            values (${inscricao}, '01234000', 'MANUAL')`,
      ),
    );
    expect((await pgError(momentoEm(OPERACAO))).code).toBe('42501');
  });

  it('npac_app não tem DELETE em inscricoes', async () => {
    const err = await pgError(
      withUser(db, DUDA, (tx) => tx.execute(sql`delete from mentoria_inscricoes`)),
    );
    expect(err.code).toBe('42501');
  });

  it('SDR com linha em perfis não ganha acesso', async () => {
    const r = await um<{ admin: boolean; perfil: string | null }>(
      SDR,
      sql`select mentoria_admin() as admin, mentoria_perfil() as perfil`,
    );
    expect(r).toEqual({ admin: false, perfil: null });
    expect(await contarInscricoes(SDR)).toBe(0);
  });

  it('pessoa desativada perde o acesso', async () => {
    await owner`update "user" set active = false where id = ${DUDA}`;
    expect(await contarInscricoes(DUDA)).toBe(0);
  });

  it('só admin define perfil; remover apaga a linha', async () => {
    const alvo = SEM_PERFIL;
    const negado = await pgError(
      withUser(db, OPERACAO, (tx) =>
        tx.execute(sql`select mentoria_definir_perfil(${alvo}, 'OPERACAO', false)`),
      ),
    );
    expect(negado.code).toBe('42501');
    await withUser(db, DUDA, (tx) =>
      tx.execute(sql`select mentoria_definir_perfil(${alvo}, 'OPERACAO', false)`),
    );
    expect(await contarInscricoes(alvo)).toBe(1);
    await withUser(db, DUDA, (tx) =>
      tx.execute(sql`select mentoria_definir_perfil(${alvo}, null, false)`),
    );
    expect(await contarInscricoes(alvo)).toBe(0);
  });

  it('não dá perfil a quem não tem o cargo Acompanhamento', async () => {
    const err = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(sql`select mentoria_definir_perfil(${SDR}, 'OPERACAO', false)`),
      ),
    );
    expect(err.code).toBe('22023');
  });
});

describe('momento inicial', () => {
  const concluir = () =>
    withUser(db, DUDA, (tx) =>
      tx.execute(sql`select mentoria_concluir_momento(${inscricao}::uuid)`),
    );
  const mudarData = (usuario: string) =>
    withUser(db, usuario, (tx) =>
      tx.execute(
        sql`update mentoria_momento_inicial set data = '2026-01-02'
            where inscricao_id = ${inscricao}`,
      ),
    );
  const nota = (usuario: string, n: number) =>
    withUser(db, usuario, (tx) =>
      tx.execute(
        sql`insert into mentoria_avaliacoes (pessoa_id, tipo, momento, nota_fe)
            values (${pessoa}, 'PILARES', 'INICIAL', ${n})
            on conflict (pessoa_id, tipo, momento) do update set nota_fe = excluded.nota_fe`,
      ),
    );

  it('momento inicial travado recusa UPDATE até destravar', async () => {
    await momentoEm(DUDA);
    await mudarData(DUDA);
    await concluir();
    expect((await pgError(mudarData(DUDA))).code).toBe('22023');
    await withUser(db, DUDA, (tx) =>
      tx.execute(sql`select mentoria_destravar_momento(${inscricao}::uuid)`),
    );
    await mudarData(DUDA);
    const [h] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_historico
      where inscricao_id = ${inscricao} and tipo = 'momento.destravado'`;
    expect(h!.n).toBe(1);
  });

  it('só admin destrava', async () => {
    await momentoEm(DUDA);
    await concluir();
    await owner`update mentoria_perfis set admin = false where user_id = ${DUDA}`;
    try {
      const err = await pgError(
        withUser(db, DUDA, (tx) =>
          tx.execute(sql`select mentoria_destravar_momento(${inscricao}::uuid)`),
        ),
      );
      expect(err.code).toBe('42501');
    } finally {
      await owner`update mentoria_perfis set admin = true where user_id = ${DUDA}`;
    }
  });

  it('npac_app não grava travado_em direto', async () => {
    await momentoEm(DUDA);
    const err = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(sql`update mentoria_momento_inicial set travado_em = null`),
      ),
    );
    expect(err.code).toBe('42501');
  });

  it('avaliação INICIAL trava junto com o momento inicial', async () => {
    await momentoEm(DUDA);
    await nota(DUDA, 7);
    await concluir();
    expect((await pgError(nota(DUDA, 3))).code).toBe('22023');
    await withUser(db, DUDA, (tx) =>
      tx.execute(sql`select mentoria_destravar_momento(${inscricao}::uuid)`),
    );
    await nota(DUDA, 3);
  });

  it('Operação não escreve avaliação', async () => {
    expect((await pgError(nota(OPERACAO, 3))).code).toBe('42501');
  });
});

describe('demais tabelas', () => {
  it('remover a pessoa 2 passa o casal a individual, com fila de mídia', async () => {
    await owner`update mentoria_inscricoes set tipo = 'CASAL' where id = ${inscricao}`;
    const [p2] = await owner<{ id: string }[]>`
      insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${inscricao}, 2, 'Pessoa Dois', 'pessoa dois') returning id`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto)
      values ('PESSOA_FOTO', ${p2!.id}, 'FOTO', 'foto/p2.jpg')`;
    await withUser(db, OPERACAO, (tx) =>
      tx.execute(sql`select mentoria_remover_pessoa_2(${inscricao}::uuid)`),
    );
    const [r] = await owner<{ tipo: string; n: number }[]>`
      select i.tipo, (select count(*)::int from mentoria_pessoas p where p.inscricao_id = i.id) as n
      from mentoria_inscricoes i where i.id = ${inscricao}`;
    expect(r).toEqual({ tipo: 'INDIVIDUAL', n: 1 });
    const fila =
      await owner`select 1 from mentoria_midia_exclusao where chave_objeto = 'foto/p2.jpg'`;
    expect(fila.length).toBe(1);
  });

  it('histórico e anotações são só de inserir', async () => {
    await withUser(db, OPERACAO, (tx) =>
      tx.execute(
        sql`insert into mentoria_anotacoes (inscricao_id, autor_id, texto)
            values (${inscricao}, ${OPERACAO}, 'cifrado')`,
      ),
    );
    const err = await pgError(
      withUser(db, OPERACAO, (tx) => tx.execute(sql`update mentoria_anotacoes set texto = 'x'`)),
    );
    expect(err.code).toBe('42501');
  });

  it('autor da anotação tem de ser quem está logado', async () => {
    const err = await pgError(
      withUser(db, OPERACAO, (tx) =>
        tx.execute(
          sql`insert into mentoria_anotacoes (inscricao_id, autor_id, texto)
              values (${inscricao}, ${DUDA}, 'cifrado')`,
        ),
      ),
    );
    expect(err.code).toBe('42501');
  });

  it('legado só para admin', async () => {
    await owner`insert into mentoria_legado (inscricao_id, dados) values (${inscricao}, 'cifrado')`;
    const n = async (u: string) =>
      (await um<{ n: number }>(u, sql`select count(*)::int as n from mentoria_legado`)).n;
    expect(await n(DUDA)).toBe(1);
    expect(await n(OPERACAO)).toBe(0);
  });

  it('mídia: Mentor não lê; Operação lê a foto de pessoa visível', async () => {
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto)
      values ('PESSOA_FOTO', ${pessoa}, 'FOTO', 'foto/p1.jpg')`;
    const n = async (u: string) =>
      (await um<{ n: number }>(u, sql`select count(*)::int as n from mentoria_midia`)).n;
    try {
      expect(await n(OPERACAO)).toBe(1);
      expect(await n(LEO)).toBe(0);
      expect(await n(MANU)).toBe(0);
      expect(await n(SEM_PERFIL)).toBe(0);
    } finally {
      await owner`delete from mentoria_midia where chave_objeto = 'foto/p1.jpg'`;
    }
  });

  it('mês da jornada trata o fim de mês como a data prevista', async () => {
    await owner`update mentoria_inscricoes set inicio_jornada = '2026-01-31' where id = ${inscricao}`;
    const mes = async (hoje: string) =>
      (
        await um<{ m: number | null }>(
          DUDA,
          sql`select mentoria_mes_jornada(${inscricao}::uuid, ${hoje}::date) as m`,
        )
      ).m;
    expect(await mes('2026-01-30')).toBeNull();
    expect(await mes('2026-01-31')).toBe(1);
    expect(await mes('2026-02-27')).toBe(1);
    expect(await mes('2026-02-28')).toBe(2);
    expect(await mes('2027-01-31')).toBe(13);
  });

  it('momento travado impede remover a pessoa 2', async () => {
    await owner`update mentoria_inscricoes set tipo = 'CASAL' where id = ${inscricao}`;
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${inscricao}, 2, 'Pessoa Dois', 'pessoa dois')`;
    await momentoEm(DUDA);
    await withUser(db, DUDA, (tx) =>
      tx.execute(sql`select mentoria_concluir_momento(${inscricao}::uuid)`),
    );
    const err = await pgError(
      withUser(db, OPERACAO, (tx) =>
        tx.execute(sql`select mentoria_remover_pessoa_2(${inscricao}::uuid)`),
      ),
    );
    expect(err.code).toBe('22023');
  });

  it('tipos gravados pelas funções não entram por INSERT direto', async () => {
    const err = await pgError(
      withUser(db, OPERACAO, (tx) =>
        tx.execute(
          sql`insert into mentoria_historico (inscricao_id, ator_id, tipo)
              values (${inscricao}, ${OPERACAO}, 'momento.destravado')`,
        ),
      ),
    );
    expect(err.code).toBe('42501');
  });

  it('criado_por da mídia tem de ser quem está logado', async () => {
    const err = await pgError(
      withUser(db, OPERACAO, (tx) =>
        tx.execute(
          sql`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, criado_por)
              values ('PESSOA_FOTO', ${pessoa}, 'FOTO', 'foto/x.jpg', ${DUDA})`,
        ),
      ),
    );
    expect(err.code).toBe('42501');
  });

  it('mentoria_pode não existe mais', async () => {
    const r = await owner`select 1 from pg_proc where proname = 'mentoria_pode'`;
    expect(r.length).toBe(0);
  });
});

describe('onboarding e envios', () => {
  const etapa = async (nome: string) => {
    const [e] = await owner<{ id: string }[]>`
      insert into mentoria_onboarding_etapas (inscricao_id, etapa)
      values (${inscricao}, ${nome}) returning id`;
    return e!.id;
  };
  const statusDe = async (id: string) =>
    (
      await owner<{ status: string }[]>`
      select status from mentoria_onboarding_etapas where id = ${id}`
    )[0]!.status;
  const atualizar = (usuario: string, id: string, status: string) =>
    withUser(db, usuario, (tx) =>
      tx.execute(
        sql`update mentoria_onboarding_etapas set status = ${status} where id = ${id}::uuid`,
      ),
    );
  const novoEnvio = (usuario: string, status = 'PREPARANDO', enviado: string | null = null) =>
    withUser(db, usuario, (tx) =>
      tx.execute(sql`insert into mentoria_envios_fisicos
        (inscricao_id, tipo, status, enviado_em, criado_por)
        values (${inscricao}, 'CAIXA', ${status}, ${enviado}, ${usuario})`),
    );

  it('Operação edita a etapa de mensagem', async () => {
    const id = await etapa('GRUPOS');
    await atualizar(OPERACAO, id, 'ENVIADA');
    expect(await statusDe(id)).toBe('ENVIADA');
  });

  it('Especialista, Mentor e sem perfil não veem nem editam', async () => {
    const id = await etapa('GRUPOS');
    for (const u of [MANU, LEO, SEM_PERFIL, SDR]) {
      const r = await um<{ n: number }>(
        u,
        sql`select count(*)::int as n from mentoria_onboarding_etapas`,
      );
      expect(r.n).toBe(0);
      await atualizar(u, id, 'ENVIADA');
      expect(await statusDe(id)).toBe('PENDENTE');
    }
  });

  it('Especialista não cria etapa nem envio', async () => {
    const err = await pgError(
      withUser(db, MANU, (tx) =>
        tx.execute(sql`insert into mentoria_onboarding_etapas (inscricao_id, etapa)
          values (${inscricao}, 'GRUPOS')`),
      ),
    );
    expect(err.code).toBe('42501');
    expect((await pgError(novoEnvio(MANU))).code).toBe('42501');
  });

  it('npac_app não apaga etapa nem envio', async () => {
    await etapa('GRUPOS');
    for (const t of ['mentoria_onboarding_etapas', 'mentoria_envios_fisicos']) {
      const err = await pgError(
        withUser(db, DUDA, (tx) => tx.execute(sql.raw(`delete from ${t}`))),
      );
      expect(err.code).toBe('42501');
    }
  });

  it('npac_app não troca a etapa nem a inscrição da linha', async () => {
    const id = await etapa('GRUPOS');
    const err = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(
          sql`update mentoria_onboarding_etapas set etapa = 'CAIXA' where id = ${id}::uuid`,
        ),
      ),
    );
    expect(err.code).toBe('42501');
  });

  it('CAIXA e IDR só aceitam DISPENSADA à mão, nem Admin passa', async () => {
    await owner`update mentoria_inscricoes set mentoria = '2M' where id = ${inscricao}`;
    for (const nome of ['CAIXA', 'IDR']) {
      const id = await etapa(nome);
      expect((await pgError(atualizar(DUDA, id, 'CONCLUIDA'))).code).toBe('22023');
      await atualizar(DUDA, id, 'DISPENSADA');
      expect(await statusDe(id)).toBe('DISPENSADA');
    }
  });

  it('datas de CAIXA e IDR não mudam à mão', async () => {
    const id = await etapa('CAIXA');
    const err = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(
          sql`update mentoria_onboarding_etapas set enviada_em = now() where id = ${id}::uuid`,
        ),
      ),
    );
    expect(err.code).toBe('22023');
  });

  it('RDV recusa dispensar no banco', async () => {
    const id = await etapa('GRUPOS');
    expect((await pgError(atualizar(DUDA, id, 'DISPENSADA'))).code).toBe('22023');
  });

  it('CAIXA não nasce concluída por INSERT direto', async () => {
    const err = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(sql`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status)
          values (${inscricao}, 'CAIXA', 'CONCLUIDA')`),
      ),
    );
    expect(err.code).toBe('22023');
  });

  it('o envio move a etapa CAIXA, mesmo com o npac_app sem poder fazer isso à mão', async () => {
    const id = await etapa('CAIXA');
    await novoEnvio(OPERACAO, 'ENVIADO', '2026-11-01');
    expect(await statusDe(id)).toBe('ENVIADA');
  });

  it('o envio não ressuscita etapa dispensada', async () => {
    await owner`update mentoria_inscricoes set mentoria = '2M' where id = ${inscricao}`;
    const id = await etapa('CAIXA');
    await atualizar(DUDA, id, 'DISPENSADA');
    await novoEnvio(DUDA, 'ENVIADO', '2026-11-01');
    expect(await statusDe(id)).toBe('DISPENSADA');
  });

  it('uma Caixa por inscrição', async () => {
    await novoEnvio(DUDA);
    expect((await pgError(novoEnvio(DUDA))).code).toBe('23505');
  });

  it('envio ENTREGUE exige as datas', async () => {
    const err = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(sql`insert into mentoria_envios_fisicos (inscricao_id, tipo, status, enviado_em)
          values (${inscricao}, 'CAIXA', 'ENTREGUE', '2026-11-01')`),
      ),
    );
    expect(err.code).toBe('23514');
  });

  it('dias parado contam da base; etapa sem envio não tem base', async () => {
    const id = await etapa('GRUPOS');
    const vazia = await um<{ b: string | null }>(
      DUDA,
      sql`select mentoria_onboarding_base(${id}::uuid) as b`,
    );
    expect(vazia.b).toBeNull();
    await owner`update mentoria_onboarding_etapas set enviada_em = '2026-11-01T12:00:00Z'
      where id = ${id}`;
    const r = await um<{ igual: boolean }>(
      DUDA,
      sql`select mentoria_onboarding_base(${id}::uuid) = '2026-11-01T12:00:00Z'::timestamptz as igual`,
    );
    expect(r.igual).toBe(true);
  });

  it('completar_campos é editável; importacao_chave não muda depois de gravada', async () => {
    await withUser(db, DUDA, (tx) =>
      tx.execute(sql`update mentoria_inscricoes set completar_campos = '{}'
        where id = ${inscricao}::uuid`),
    );
    const err = await pgError(
      withUser(db, DUDA, (tx) =>
        tx.execute(sql`update mentoria_inscricoes set importacao_chave = 'x'
          where id = ${inscricao}::uuid`),
      ),
    );
    expect(err.code).toBe('42501');
  });
});
