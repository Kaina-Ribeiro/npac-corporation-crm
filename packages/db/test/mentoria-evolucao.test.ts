import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// NPAC-57 (migration 0076): aba Evolução. Leem Admin, Acompanhamento (com o recorte "só a carteira") e Operação; a
// Especialista não lê nada. Escrevem Admin e Acompanhamento (área EVOLUCAO). Conquista sem edição de texto; exclusão só
// por mentoria_conquista_excluir. A cópia do sistema antigo grava por duas funções só do npac_app, sem pessoa logada.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const ADMIN = 'ev-admin'; // Diretoria
const DUDA = 'ev-duda'; // Acompanhamento + Admin
const ACOMP = 'ev-acomp'; // Acompanhamento, todos os mentorados
const CART = 'ev-cart'; // Acompanhamento, só a carteira (responsável por `minha`)
const OPERACAO = 'ev-operacao';
const MANU = 'ev-manu'; // Especialista que conduziu reunião nas duas inscrições

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
/** Como o npac_app sem pessoa logada (a cópia do legado ao subir a API). */
const semUsuario = async <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) => [
  ...(await db.execute<T>(s)),
];

let minha: string; // da carteira da CART
let outra: string; // da ACOMP

const novaInscricao = async (n: number, responsavel: string) => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', '2026-01-10', '2027-01-10', ${responsavel}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício E${n}`}, ${`mentorado ficticio e${n}`})`;
  await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
    values (${i!.id}, 'POSICIONAMENTO', ${MANU}, now() - interval '2 hours')`;
  return i!.id;
};
const evolucao = (insc: string) =>
  owner`insert into mentoria_evolucao (inscricao_id, reserva_antes, reserva_hoje, renda, saude, investimentos,
      area_atuacao, inicial_notas, atual_notas)
    values (${insc}, 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8')`;
const conquista = async (insc: string) => {
  const [c] = await owner<{ id: string }[]>`
    insert into mentoria_conquistas (inscricao_id, data, descricao) values (${insc}, '2026-05-01', 'cifrado')
    returning id`;
  return c!.id;
};
/** Mídia do dono com uma chave única, para achar na fila de exclusão. */
const midia = async (donoTipo: string, donoId: string) => {
  const chave = `evolucao-${randomUUID()}`;
  const [m] = await owner<{ id: string }[]>`
    insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes)
    values (${donoTipo}, ${donoId}, 'FOTO', ${chave}, 'image/webp', 10) returning id`;
  return { id: m!.id, chave };
};
const naFila = async (chave: string) =>
  (
    await owner<
      { n: number }[]
    >`select count(*)::int as n from mentoria_midia_exclusao where chave_objeto = ${chave}`
  )[0]!.n;
const conta = async (u: string, tabela: string) =>
  (await q<{ n: number }>(u, sql`select count(*)::int as n from ${sql.identifier(tabela)}`))[0]!.n;

beforeAll(async () => {
  await owner`delete from mentoria_midia where criado_por like 'ev-%'`;
  await owner`delete from mentoria_perfis where user_id like 'ev-%'`;
  await owner`delete from "user" where id like 'ev-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${ADMIN}, 'Admin Ev', 'admin@ev.test', 'DIRETOR', false, false),
      (${DUDA}, 'Duda Ev', 'duda@ev.test', 'ACOMPANHAMENTO', false, false),
      (${ACOMP}, 'Acomp Ev', 'acomp@ev.test', 'ACOMPANHAMENTO', false, false),
      (${CART}, 'Cart Ev', 'cart@ev.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op Ev', 'op@ev.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu Ev', 'manu@ev.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', true), (${ACOMP}, 'ACOMPANHAMENTO', false),
      (${CART}, 'ACOMPANHAMENTO', false), (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`update area_membros set alcance = 'CARTEIRA' where user_id = ${CART}`;
  minha = await novaInscricao(1, CART);
  outra = await novaInscricao(2, ACOMP);
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_midia where criado_por like 'ev-%'`;
  await owner`delete from mentoria_perfis where user_id like 'ev-%'`;
  await owner`delete from "user" where id like 'ev-%'`;
  await closeTestConnections();
});

describe('leitura e escrita', () => {
  it('Admin, Acompanhamento e Operação leem a evolução; Especialista lê zero linhas', async () => {
    await evolucao(outra);
    await conquista(outra);
    for (const u of [ADMIN, DUDA, ACOMP, OPERACAO]) {
      expect({ u, n: await conta(u, 'mentoria_evolucao') }).toEqual({ u, n: 1 });
      expect({ u, n: await conta(u, 'mentoria_conquistas') }).toEqual({ u, n: 1 });
    }
    // A Especialista conduziu reunião na inscrição (vê a ficha), mas não a evolução.
    expect(await conta(MANU, 'mentoria_inscricoes')).toBe(2);
    expect(await conta(MANU, 'mentoria_evolucao')).toBe(0);
    expect(await conta(MANU, 'mentoria_conquistas')).toBe(0);
    const ve = async (u: string) =>
      (await q<{ v: boolean }>(u, sql`select mentoria_ve_evolucao(${outra}::uuid) as v`))[0]!.v;
    expect(await ve(OPERACAO)).toBe(true);
    expect(await ve(MANU)).toBe(false);

    // Acompanhamento grava; quem criou é do banco.
    await q(ACOMP, sql`insert into mentoria_evolucao (inscricao_id, renda) values (${minha}, 'x')`);
    await q(
      DUDA,
      sql`insert into mentoria_conquistas (inscricao_id, descricao, criado_por) values (${minha}, 'x', ${DUDA})`,
    );
    const [e] = await owner<{ criado_por: string; version: number }[]>`
      select criado_por, version from mentoria_evolucao where inscricao_id = ${minha}`;
    expect(e).toEqual({ criado_por: ACOMP, version: 1 });
    // Conquista em nome de outra pessoa: recusada.
    expect(
      (
        await pgError(
          q(
            ACOMP,
            sql`insert into mentoria_conquistas (inscricao_id, descricao, criado_por) values (${minha}, 'x', ${DUDA})`,
          ),
        )
      ).code,
    ).toBe('42501');
  });

  it('"só a carteira" lê só as inscrições em que é responsável', async () => {
    await evolucao(minha);
    await evolucao(outra);
    await conquista(minha);
    await conquista(outra);
    expect(await conta(CART, 'mentoria_evolucao')).toBe(1);
    expect(await conta(CART, 'mentoria_conquistas')).toBe(1);
    expect(await conta(ACOMP, 'mentoria_evolucao')).toBe(2);
    const ok = await q(
      CART,
      sql`update mentoria_evolucao set renda = 'novo' where inscricao_id in (${minha}, ${outra}) returning inscricao_id`,
    );
    expect(ok).toEqual([{ inscricao_id: minha }]);
    expect(
      (
        await pgError(
          q(
            CART,
            sql`insert into mentoria_conquistas (inscricao_id, descricao, criado_por) values (${outra}, 'x', ${CART})`,
          ),
        )
      ).code,
    ).toBe('42501');
    const ve = async (insc: string) =>
      (await q<{ v: boolean }>(CART, sql`select mentoria_ve_evolucao(${insc}::uuid) as v`))[0]!.v;
    expect(await ve(minha)).toBe(true);
    expect(await ve(outra)).toBe(false);
  });

  it('Operação não grava (UPDATE afeta 0 linhas / INSERT recusado pela política)', async () => {
    await evolucao(outra);
    const c = await conquista(outra);
    expect(
      await q(
        OPERACAO,
        sql`update mentoria_evolucao set renda = 'x' where inscricao_id = ${outra} returning 1`,
      ),
    ).toHaveLength(0);
    expect(
      (
        await pgError(
          q(OPERACAO, sql`insert into mentoria_evolucao (inscricao_id) values (${minha})`),
        )
      ).code,
    ).toBe('42501');
    expect(
      (
        await pgError(
          q(
            OPERACAO,
            sql`insert into mentoria_conquistas (inscricao_id, descricao, criado_por) values (${outra}, 'x', ${OPERACAO})`,
          ),
        )
      ).code,
    ).toBe('42501');
    expect(
      await q(
        OPERACAO,
        sql`update mentoria_conquistas set midia_id = gen_random_uuid() where id = ${c} returning 1`,
      ),
    ).toHaveLength(0);
    // Conquista não muda de texto nem de data (nem para quem edita); só ganha a mídia.
    expect(
      (await pgError(q(ACOMP, sql`update mentoria_conquistas set descricao = 'y' where id = ${c}`)))
        .code,
    ).toBe('42501');
    expect(
      (await pgError(q(ACOMP, sql`delete from mentoria_conquistas where id = ${c}`))).code,
    ).toBe('42501');
    expect(
      (await pgError(q(ADMIN, sql`delete from mentoria_evolucao where inscricao_id = ${outra}`)))
        .code,
    ).toBe('42501');
  });

  it('momento atual: quem atualizou e quando são do banco; outro campo não muda o rodapé', async () => {
    await q(DUDA, sql`insert into mentoria_evolucao (inscricao_id, renda) values (${outra}, 'x')`);
    const rodape = async () =>
      (
        await owner<{ por: string | null; em: Date | null }[]>`
        select atual_atualizado_por as por, atual_atualizado_em as em from mentoria_evolucao
        where inscricao_id = ${outra}`
      )[0]!;
    expect(await rodape()).toEqual({ por: null, em: null });
    await q(
      ACOMP,
      sql`update mentoria_evolucao set atual_notas = 'y', atual_atualizado_por = ${DUDA}, version = version + 1
        where inscricao_id = ${outra}`,
    );
    const r1 = await rodape();
    expect(r1.por).toBe(ACOMP);
    expect(r1.em).not.toBeNull();
    await q(DUDA, sql`update mentoria_evolucao set renda = 'z' where inscricao_id = ${outra}`);
    expect((await rodape()).por).toBe(ACOMP);
    // Trocar a foto do momento atual também conta.
    const m = await midia('EVOLUCAO_ATUAL', outra);
    await q(
      DUDA,
      sql`update mentoria_evolucao set foto_atual_midia_id = ${m.id} where inscricao_id = ${outra}`,
    );
    expect((await rodape()).por).toBe(DUDA);
  });

  it('fotos e mídia da conquista seguem a regra da evolução', async () => {
    const c = await conquista(outra);
    const inserir = (u: string, tipo: string, dono: string) =>
      q(
        u,
        sql`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto, mime, tamanho_bytes, criado_por)
          values (${tipo}, ${dono}, 'FOTO', ${`evolucao-${randomUUID()}`}, 'image/webp', 10, ${u}) returning id`,
      );
    await inserir(ACOMP, 'EVOLUCAO_INICIAL', outra);
    await inserir(ACOMP, 'EVOLUCAO_ATUAL', outra);
    await inserir(DUDA, 'CONQUISTA', c);
    expect((await pgError(inserir(OPERACAO, 'EVOLUCAO_ATUAL', outra))).code).toBe('42501');
    expect((await pgError(inserir(MANU, 'CONQUISTA', c))).code).toBe('42501');
    expect((await pgError(inserir(CART, 'EVOLUCAO_INICIAL', outra))).code).toBe('42501');
    expect(await conta(OPERACAO, 'mentoria_midia')).toBe(3);
    expect(await conta(MANU, 'mentoria_midia')).toBe(0);
    expect(await conta(CART, 'mentoria_midia')).toBe(0);

    // Apagar a foto pela função solta o apontamento.
    const m = await midia('EVOLUCAO_INICIAL', outra);
    await owner`insert into mentoria_evolucao (inscricao_id, foto_inicial_midia_id) values (${outra}, ${m.id})`;
    const cm = await midia('CONQUISTA', c);
    await owner`update mentoria_conquistas set midia_id = ${cm.id} where id = ${c}`;
    await q(ACOMP, sql`select mentoria_excluir_midia(${m.id}::uuid)`);
    await q(ACOMP, sql`select mentoria_excluir_midia(${cm.id}::uuid)`);
    const [e] = await owner<{ f: string | null }[]>`
      select foto_inicial_midia_id as f from mentoria_evolucao where inscricao_id = ${outra}`;
    expect(e!.f).toBeNull();
    const [x] = await owner<
      { m: string | null }[]
    >`select midia_id as m from mentoria_conquistas where id = ${c}`;
    expect(x!.m).toBeNull();
    expect(await naFila(m.chave)).toBe(1);
    expect(await naFila(cm.chave)).toBe(1);
  });
});

describe('mídia conferida pelo dono', () => {
  it('foto e mídia da conquista só apontam para a mídia do próprio dono', async () => {
    const c = await conquista(outra);
    const c2 = await conquista(outra);
    const iniOutra = await midia('EVOLUCAO_INICIAL', outra);
    const atuOutra = await midia('EVOLUCAO_ATUAL', outra);
    const iniMinha = await midia('EVOLUCAO_INICIAL', minha);
    const daConquista = await midia('CONQUISTA', c);
    const daOutraConquista = await midia('CONQUISTA', c2);
    await q(ACOMP, sql`insert into mentoria_evolucao (inscricao_id) values (${outra})`);
    const foto = (coluna: 'foto_inicial_midia_id' | 'foto_atual_midia_id', id: string) =>
      q(
        ACOMP,
        sql`update mentoria_evolucao set ${sql.identifier(coluna)} = ${id}::uuid where inscricao_id = ${outra}`,
      );
    const recusa = async (p: Promise<unknown>) => expect((await pgError(p)).code).toBe('22023');

    await recusa(foto('foto_inicial_midia_id', iniMinha.id)); // de outra inscrição
    await recusa(foto('foto_inicial_midia_id', atuOutra.id)); // outro tipo de dono
    await recusa(foto('foto_atual_midia_id', iniOutra.id));
    await recusa(foto('foto_atual_midia_id', randomUUID())); // não existe
    await recusa(
      q(
        ACOMP,
        sql`insert into mentoria_evolucao (inscricao_id, foto_inicial_midia_id) values (${minha}, ${iniOutra.id})`,
      ),
    );
    await recusa(
      q(
        ACOMP,
        sql`update mentoria_conquistas set midia_id = ${daOutraConquista.id} where id = ${c}`,
      ),
    );
    await recusa(
      q(ACOMP, sql`update mentoria_conquistas set midia_id = ${iniOutra.id} where id = ${c}`),
    );
    await recusa(
      q(
        ACOMP,
        sql`insert into mentoria_conquistas (inscricao_id, descricao, midia_id, criado_por)
          values (${outra}, 'x', ${daConquista.id}, ${ACOMP})`,
      ),
    );
    // Nem o dono do banco aponta errado.
    await recusa(
      owner`update mentoria_conquistas set midia_id = ${daOutraConquista.id} where id = ${c}`,
    );

    await foto('foto_inicial_midia_id', iniOutra.id);
    await foto('foto_atual_midia_id', atuOutra.id);
    await q(
      ACOMP,
      sql`update mentoria_conquistas set midia_id = ${daConquista.id} where id = ${c}`,
    );
    const [e] = await owner<{ i: string; a: string }[]>`
      select foto_inicial_midia_id as i, foto_atual_midia_id as a from mentoria_evolucao where inscricao_id = ${outra}`;
    expect(e).toEqual({ i: iniOutra.id, a: atuOutra.id });
    // Nulo continua valendo, e mexer em outro campo não reconfere a foto.
    await q(ACOMP, sql`update mentoria_evolucao set renda = 'y' where inscricao_id = ${outra}`);
    await foto('foto_atual_midia_id', null as unknown as string);
  });
});

describe('exclusão e LGPD', () => {
  it('conquista_excluir enfileira a mídia e apaga; Operação recebe P0002', async () => {
    const c = await conquista(outra);
    const m = await midia('CONQUISTA', c);
    await owner`update mentoria_conquistas set midia_id = ${m.id} where id = ${c}`;
    const excluir = (u: string, id = c) =>
      q(u, sql`select mentoria_conquista_excluir(${id}::uuid)`);
    expect((await pgError(excluir(OPERACAO))).code).toBe('P0002');
    expect((await pgError(excluir(MANU))).code).toBe('P0002');
    expect((await pgError(excluir(CART))).code).toBe('P0002');
    expect((await pgError(excluir(ACOMP, randomUUID()))).code).toBe('P0002');
    await excluir(ACOMP);
    expect((await owner`select 1 from mentoria_conquistas where id = ${c}`).length).toBe(0);
    expect((await owner`select 1 from mentoria_midia where id = ${m.id}`).length).toBe(0);
    expect(await naFila(m.chave)).toBe(1);
  });

  it('anonimizar zera os textos da evolução e das conquistas e enfileira as fotos', async () => {
    await evolucao(outra);
    const ini = await midia('EVOLUCAO_INICIAL', outra);
    const atu = await midia('EVOLUCAO_ATUAL', outra);
    await owner`update mentoria_evolucao set foto_inicial_midia_id = ${ini.id}, foto_atual_midia_id = ${atu.id}
      where inscricao_id = ${outra}`;
    const c = await conquista(outra);
    const cm = await midia('CONQUISTA', c);
    await owner`update mentoria_conquistas set midia_id = ${cm.id} where id = ${c}`;
    await evolucao(minha); // outra inscrição fica como está

    await q(ADMIN, sql`select mentoria_anonimizar_inscricao(${outra}::uuid)`);
    const [e] = await owner<Record<string, unknown>[]>`
      select reserva_antes, reserva_hoje, renda, saude, investimentos, area_atuacao, inicial_notas, atual_notas,
        foto_inicial_midia_id, foto_atual_midia_id
      from mentoria_evolucao where inscricao_id = ${outra}`;
    expect(e).toBeDefined();
    expect(Object.values(e!).every((v) => v === null)).toBe(true);
    const [x] = await owner<
      { descricao: string | null; midia_id: string | null; data: string | null }[]
    >`
      select descricao, midia_id, data::text from mentoria_conquistas where id = ${c}`;
    expect(x).toEqual({ descricao: null, midia_id: null, data: '2026-05-01' });
    for (const m of [ini, atu, cm]) expect(await naFila(m.chave)).toBe(1);
    expect(
      (await owner`select 1 from mentoria_midia where id in (${ini.id}, ${atu.id}, ${cm.id})`)
        .length,
    ).toBe(0);
    const [mantida] = await owner<{ renda: string }[]>`
      select renda from mentoria_evolucao where inscricao_id = ${minha}`;
    expect(mantida!.renda).toBe('c3');
  });

  it('excluir inscrição apaga evolução e conquistas e enfileira as mídias', async () => {
    await evolucao(outra);
    const ini = await midia('EVOLUCAO_INICIAL', outra);
    const c = await conquista(outra);
    const cm = await midia('CONQUISTA', c);
    await q(ADMIN, sql`select mentoria_excluir_inscricao(${outra}::uuid)`);
    expect(
      (await owner`select 1 from mentoria_evolucao where inscricao_id = ${outra}`).length,
    ).toBe(0);
    expect(
      (await owner`select 1 from mentoria_conquistas where inscricao_id = ${outra}`).length,
    ).toBe(0);
    expect(await naFila(ini.chave)).toBe(1);
    expect(await naFila(cm.chave)).toBe(1);
  });
});

describe('cópia do sistema antigo', () => {
  const gravar = (insc: string, conquistas: unknown[]) =>
    semUsuario<{ ok: boolean }>(
      sql`select mentoria_evolucao_legado_gravar(${insc}::uuid, 'ra', 'rh', 'renda', 'saude', 'inv', 'area', 'ini',
        null, ${JSON.stringify(conquistas)}::jsonb) as ok`,
    );

  it('legado_gravar: segunda chamada devolve false e não duplica conquistas; não sobrescreve campo já preenchido', async () => {
    await owner`insert into mentoria_legado (inscricao_id, dados) values (${outra}, 'cifrado-outra'),
      (${minha}, 'cifrado-minha')`;
    // A equipe já escreveu a reserva de antes na inscrição `outra`.
    await q(
      ACOMP,
      sql`insert into mentoria_evolucao (inscricao_id, reserva_antes) values (${outra}, 'equipe')`,
    );

    const pendentes = async () =>
      (
        await semUsuario<{ inscricao_id: string; dados: string }>(
          sql`select * from mentoria_evolucao_legado_pendentes(10)`,
        )
      ).sort((a, b) => a.inscricao_id.localeCompare(b.inscricao_id));
    expect(await pendentes()).toEqual(
      [
        { inscricao_id: outra, dados: 'cifrado-outra' },
        { inscricao_id: minha, dados: 'cifrado-minha' },
      ].sort((a, b) => a.inscricao_id.localeCompare(b.inscricao_id)),
    );
    expect(await semUsuario(sql`select * from mentoria_evolucao_legado_pendentes(1)`)).toHaveLength(
      1,
    );

    const id1 = randomUUID();
    const conquistas = [
      { id: id1, data: '2025-03-10', descricao: 'cifrado-1' },
      { id: randomUUID(), data: null, descricao: 'cifrado-2' },
    ];
    expect(await gravar(outra, conquistas)).toEqual([{ ok: true }]);
    expect(await gravar(outra, conquistas)).toEqual([{ ok: false }]);

    const [e] = await owner<Record<string, unknown>[]>`
      select reserva_antes, reserva_hoje, renda, inicial_notas, atual_notas, version, criado_por,
        atual_atualizado_por, legado_copiado_em is not null as copiado
      from mentoria_evolucao where inscricao_id = ${outra}`;
    expect(e).toEqual({
      reserva_antes: 'equipe',
      reserva_hoje: 'rh',
      renda: 'renda',
      inicial_notas: 'ini',
      atual_notas: null,
      version: 2, // quem estava com a tela aberta recebe 409 e a fila reaplica
      criado_por: ACOMP,
      atual_atualizado_por: null,
      copiado: true,
    });
    const cs = await owner<
      { id: string; data: string | null; descricao: string; criado_por: string | null }[]
    >`
      select id, data::text, descricao, criado_por from mentoria_conquistas where inscricao_id = ${outra}
      order by data nulls last`;
    expect(cs).toEqual([
      { id: id1, data: '2025-03-10', descricao: 'cifrado-1', criado_por: null },
      { id: conquistas[1]!.id, data: null, descricao: 'cifrado-2', criado_por: null },
    ]);
    // Sem histórico (a cópia não tem pessoa) e a inscrição sai dos pendentes.
    expect(
      (await owner`select 1 from mentoria_historico where inscricao_id = ${outra}`).length,
    ).toBe(0);
    expect((await pendentes()).map((p) => p.inscricao_id)).toEqual([minha]);

    // Inscrição sem linha: a cópia cria, sem autoria.
    expect(await gravar(minha, [])).toEqual([{ ok: true }]);
    const [n] = await owner<{ criado_por: string | null; version: number }[]>`
      select criado_por, version from mentoria_evolucao where inscricao_id = ${minha}`;
    expect(n).toEqual({ criado_por: null, version: 1 });
    expect(await pendentes()).toEqual([]);
    // Inscrição que não existe: false, sem erro.
    expect(await gravar(randomUUID(), [])).toEqual([{ ok: false }]);
  });

  it('as funções da cópia não abrem o legado para quem está logado', async () => {
    await owner`insert into mentoria_legado (inscricao_id, dados) values (${outra}, 'cifrado-outra')`;
    // npac_app pode chamar (é a API ao subir); PUBLIC não.
    const [g] = await owner<{ pub: boolean; app: boolean }[]>`
      select has_function_privilege('public', 'mentoria_evolucao_legado_pendentes(int, uuid)', 'execute') as pub,
        has_function_privilege('npac_app', 'mentoria_evolucao_legado_pendentes(int, uuid)', 'execute') as app`;
    expect(g).toEqual({ pub: false, app: true });
    const [h] = await owner<{ pub: boolean }[]>`
      select has_function_privilege('public',
        'mentoria_evolucao_legado_gravar(uuid, text, text, text, text, text, text, text, text, jsonb)', 'execute') as pub`;
    expect(h!.pub).toBe(false);

    // Dentro de uma sessão (withUser), qualquer perfil, inclusive a Diretoria, é recusado nas duas.
    for (const u of [ADMIN, DUDA, ACOMP, OPERACAO, MANU, 'ev-nao-existe']) {
      expect(
        (await pgError(q(u, sql`select * from mentoria_evolucao_legado_pendentes(10)`))).code,
      ).toBe('42501');
      expect(
        (
          await pgError(
            q(
              u,
              sql`select mentoria_evolucao_legado_gravar(${outra}::uuid, 'x', null, null, null, null, null, null,
                null, '[]'::jsonb)`,
            ),
          )
        ).code,
      ).toBe('42501');
    }
    expect(
      (await owner`select 1 from mentoria_evolucao where inscricao_id = ${outra}`).length,
    ).toBe(0);
    // Fora de sessão (a cópia ao subir a API), funcionam.
    expect(
      await semUsuario(sql`select * from mentoria_evolucao_legado_pendentes(10)`),
    ).toHaveLength(1);
    expect(await gravar(outra, [])).toEqual([{ ok: true }]);
  });

  it('pendentes anda por páginas: depois do último id lido', async () => {
    await owner`insert into mentoria_legado (inscricao_id, dados) values (${outra}, 'a'), (${minha}, 'b')`;
    const primeiro = await semUsuario<{ inscricao_id: string }>(
      sql`select inscricao_id from mentoria_evolucao_legado_pendentes(1)`,
    );
    const resto = await semUsuario<{ inscricao_id: string }>(
      sql`select inscricao_id from mentoria_evolucao_legado_pendentes(10, ${primeiro[0]!.inscricao_id}::uuid)`,
    );
    expect(resto).toHaveLength(1);
    expect(resto[0]!.inscricao_id).not.toBe(primeiro[0]!.inscricao_id);
  });
});
