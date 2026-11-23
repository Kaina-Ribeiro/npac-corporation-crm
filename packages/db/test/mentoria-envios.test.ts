import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

// NPAC-56, Parte 2 (0078): o cargo Envios (a Maria) não lê nada do módulo pela RLS; vê a lista de envios
// (`mentoria_envios_lista`: nome, endereço e a foto do presente) e marca enviado e entregue
// (`mentoria_envio_marcar`). A Caixa entra com o formulário do endereço marcado (G8), o presente com a foto
// da família (M5), kit e certificado à mão (G10). A Caixa entregue conclui a etapa CAIXA.
const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DUDA = 'me-duda'; // Acompanhamento + Admin
const OPERACAO = 'me-operacao';
const MARIA = 'me-maria'; // Envios
const MANU = 'me-manu'; // Especialista
const AGORA = '2026-11-22T10:00:00-03:00';

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

type Linha = {
  envio_id: string | null;
  inscricao_id: string;
  tipo: string;
  status: string;
  nome1: string | null;
  nome2: string | null;
  endereco: string | null;
  cep: string | null;
  foto_midia_id: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  rastreio: string | null;
  version: number;
};
const lista = (u: string) =>
  q<Linha>(u, sql`select * from mentoria_envios_lista(${AGORA}::timestamptz)`);

const marcar = (
  u: string,
  l: Pick<Linha, 'inscricao_id' | 'tipo' | 'envio_id' | 'version'>,
  status: 'ENVIADO' | 'ENTREGUE',
  data: string | null,
  rastreio: string | null = null,
) =>
  q<{ v: number }>(
    u,
    sql`select mentoria_envio_marcar(${l.inscricao_id}::uuid, ${l.tipo}, ${l.envio_id}::uuid,
      ${l.version}, ${status}, ${data}::date, ${rastreio}, ${AGORA}::timestamptz) as v`,
  ).then((r) => r[0]!.v);

/** Inscrição com as seis etapas, pessoa(s) e endereço; boas-vindas com o formulário como pedido. */
async function inscricao(o: {
  status?: string;
  nomes?: string[];
  formulario?: boolean;
  endereco?: boolean;
}) {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status)
    values (${(o.nomes?.length ?? 1) > 1 ? 'CASAL' : 'INDIVIDUAL'}, 'RDV', ${o.status ?? 'ONBOARDING'})
    returning id`;
  const id = i!.id;
  for (const [n, nome] of (o.nomes ?? ['Mentorado Fictício Envio']).entries())
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${id}, ${n + 1}, ${nome}, ${nome.toLowerCase()})`;
  await owner`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status)
    select ${id}, e, 'PENDENTE'
    from unnest(array['BOAS_VINDAS','GRUPOS','AQUECIMENTO','PME_AQUECIMENTO','CAIXA','IDR']) e`;
  if (o.formulario)
    await owner`update mentoria_onboarding_etapas set formulario_preenchido = true
      where inscricao_id = ${id} and etapa = 'BOAS_VINDAS'`;
  if (o.endereco !== false)
    await owner`insert into mentoria_enderecos (inscricao_id, endereco, cep)
      values (${id}, 'cifra-endereco', '01415000')`;
  return id;
}

const etapaCaixa = async (id: string) =>
  (
    await owner<{ status: string }[]>`select status from mentoria_onboarding_etapas
      where inscricao_id = ${id} and etapa = 'CAIXA'`
  )[0]!.status;

beforeAll(async () => {
  await owner`delete from "user" where id like 'me-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close) values
      (${DUDA}, 'Duda Me', 'duda@me.test', 'ACOMPANHAMENTO', false, false),
      (${OPERACAO}, 'Op Me', 'op@me.test', 'ACOMPANHAMENTO', false, false),
      (${MARIA}, 'Maria Me', 'maria@me.test', 'ACOMPANHAMENTO', false, false),
      (${MANU}, 'Manu Me', 'manu@me.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values
    (${DUDA}, 'ACOMPANHAMENTO', true), (${OPERACAO}, 'OPERACAO', false),
    (${MARIA}, 'ENVIOS', false), (${MANU}, 'ESPECIALISTA', false)`;
});

beforeEach(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_midia where criado_por like 'me-%'`;
});

afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_midia where criado_por like 'me-%'`;
  await owner`delete from "user" where id like 'me-%'`;
  await closeTestConnections();
});

describe('cargo Envios', () => {
  it('é um cargo do Acompanhamento e não lê nada do módulo pela RLS', async () => {
    const [m] = await owner<{ cargo: string }[]>`
      select cargo from area_membros where user_id = ${MARIA} and area = 'ACOMPANHAMENTO'`;
    expect(m!.cargo).toBe('ENVIOS');
    const id = await inscricao({ formulario: true });
    await owner`insert into mentoria_envios_fisicos (inscricao_id, tipo) values (${id}, 'KIT')`;
    const n = await q<Record<string, number>>(
      MARIA,
      sql`select (select count(*) from mentoria_inscricoes)::int as i,
        (select count(*) from mentoria_pessoas)::int as p,
        (select count(*) from mentoria_enderecos)::int as e,
        (select count(*) from mentoria_envios_fisicos)::int as v,
        (select count(*) from mentoria_onboarding_etapas)::int as o,
        mentoria_perfil() as perfil, mentoria_ve_todas() as todas`,
    );
    expect(n[0]).toEqual({ i: 0, p: 0, e: 0, v: 0, o: 0, perfil: 'ENVIOS', todas: false });
    // Para a Duda, a mesma consulta vê tudo.
    const d = await q<{ i: number }>(DUDA, sql`select count(*)::int as i from mentoria_inscricoes`);
    expect(d[0]!.i).toBe(1);
  });

  it('outro cargo do módulo não chama a lista (42501); fora dele também não', async () => {
    expect((await pgError(lista(MANU))).code).toBe('42501');
  });
});

describe('lista de envios', () => {
  it('Caixa entra só com o formulário do endereço marcado (G8), com nome, endereço e CEP', async () => {
    const id = await inscricao({ nomes: ['Mentorada Fictícia A', 'Mentorado Fictício B'] });
    expect(await lista(MARIA)).toEqual([]);
    await owner`update mentoria_onboarding_etapas set formulario_preenchido = true
      where inscricao_id = ${id} and etapa = 'BOAS_VINDAS'`;
    const l = await lista(MARIA);
    expect(l).toEqual([
      {
        envio_id: null,
        inscricao_id: id,
        tipo: 'CAIXA',
        status: 'PREPARANDO',
        nome1: 'Mentorada Fictícia A',
        nome2: 'Mentorado Fictício B',
        endereco: 'cifra-endereco',
        cep: '01415000',
        foto_midia_id: null,
        enviado_em: null,
        entregue_em: null,
        rastreio: null,
        version: 0,
      },
    ]);
  });

  it('presente só com a foto da família; kit e certificado preparando; cancelada fica de fora', async () => {
    const com = await inscricao({ status: 'ATIVO' });
    const sem = await inscricao({ status: 'ATIVO' });
    const cancelada = await inscricao({ status: 'CANCELADO', formulario: true });
    const [m] = await owner<{ id: string }[]>`insert into mentoria_midia
      (dono_tipo, dono_id, tipo, mime, chave_objeto, tamanho_bytes, criado_por)
      values ('FOTO_FAMILIA', ${com}, 'FOTO', 'image/jpeg', 'chave-teste', 10, ${DUDA}) returning id`;
    await owner`update mentoria_inscricoes set foto_familia_midia_id = ${m!.id} where id = ${com}`;
    await owner`insert into mentoria_envios_fisicos (inscricao_id, tipo) values
      (${sem}, 'CERTIFICADO'), (${cancelada}, 'KIT')`;
    const l = await lista(MARIA);
    expect(l.map((x) => [x.inscricao_id, x.tipo, x.foto_midia_id]).sort()).toEqual(
      [
        [com, 'PRESENTE_FAMILIA', m!.id],
        [sem, 'CERTIFICADO', null],
      ].sort(),
    );
    // A foto do presente fica legível para ela enquanto o presente não foi entregue.
    const foto = () =>
      q<{ n: number }>(
        MARIA,
        sql`select count(*)::int as n from mentoria_midia where id = ${m!.id}`,
      );
    expect((await foto())[0]!.n).toBe(1);
    const presente = l.find((x) => x.tipo === 'PRESENTE_FAMILIA')!;
    const v1 = await marcar(MARIA, presente, 'ENVIADO', '2026-11-20');
    expect((await foto())[0]!.n).toBe(1);
    const [emTransito] = (await lista(MARIA)).filter((x) => x.tipo === 'PRESENTE_FAMILIA');
    expect(emTransito).toMatchObject({ status: 'ENVIADO', version: v1, foto_midia_id: m!.id });
    await marcar(MARIA, emTransito!, 'ENTREGUE', '2026-11-21');
    expect((await foto())[0]!.n).toBe(0);
    expect(
      (await lista(MARIA)).find((x) => x.tipo === 'PRESENTE_FAMILIA')?.foto_midia_id,
    ).toBeNull();
  });

  it('entregues só dos últimos 30 dias', async () => {
    const id = await inscricao({ status: 'ATIVO' });
    await owner`insert into mentoria_envios_fisicos (inscricao_id, tipo, status, enviado_em, entregue_em)
      values (${id}, 'KIT', 'ENTREGUE', '2026-10-01', '2026-10-10'),
        (${id}, 'CERTIFICADO', 'ENTREGUE', '2026-11-01', '2026-11-05')`;
    expect((await lista(MARIA)).map((x) => x.tipo)).toEqual(['CERTIFICADO']);
  });

  it('a gestão com "só a carteira" vê só os envios da carteira', async () => {
    const minha = await inscricao({ formulario: true });
    await inscricao({ formulario: true });
    await owner`update mentoria_inscricoes set responsavel_id = ${DUDA} where id = ${minha}`;
    await owner`update area_membros set head = false, alcance = 'CARTEIRA'
      where user_id = ${DUDA} and area = 'ACOMPANHAMENTO'`;
    try {
      expect((await lista(DUDA)).map((x) => x.inscricao_id)).toEqual([minha]);
    } finally {
      await owner`update area_membros set alcance = 'TODOS', head = true
        where user_id = ${DUDA} and area = 'ACOMPANHAMENTO'`;
    }
    expect(await lista(OPERACAO)).toHaveLength(2);
  });
});

describe('marcar enviado e entregue', () => {
  it('a Caixa enviada e entregue pela Maria conclui a etapa CAIXA, com histórico sem valores', async () => {
    const id = await inscricao({ formulario: true });
    const [caixa] = await lista(MARIA);
    const v1 = await marcar(MARIA, caixa!, 'ENVIADO', '2026-11-20', '  BR123456789BR ');
    expect(await etapaCaixa(id)).toBe('ENVIADA');
    const [emTransito] = await lista(MARIA);
    expect(emTransito).toMatchObject({
      tipo: 'CAIXA',
      status: 'ENVIADO',
      rastreio: 'BR123456789BR',
      version: v1,
    });
    expect(emTransito!.envio_id).not.toBeNull();
    await marcar(MARIA, emTransito!, 'ENTREGUE', '2026-11-22');
    expect(await etapaCaixa(id)).toBe('CONCLUIDA');
    const h = await owner<{ tipo: string; ator_id: string; campos: string[] }[]>`
      select tipo, ator_id, campos from mentoria_historico where inscricao_id = ${id} order by quando`;
    expect(h).toEqual([
      { tipo: 'caixa.enviada', ator_id: MARIA, campos: ['status', 'enviado_em', 'rastreio'] },
      { tipo: 'caixa.entregue', ator_id: MARIA, campos: ['status', 'entregue_em'] },
    ]);
  });

  it('versão velha → P0409; Caixa sem formulário ou de inscrição cancelada → P0002', async () => {
    const id = await inscricao({ formulario: true });
    const [caixa] = await lista(MARIA);
    await marcar(MARIA, caixa!, 'ENVIADO', '2026-11-20');
    // A mesma leitura de antes (sem linha, versão 0): já saiu por outra aba.
    expect((await pgError(marcar(OPERACAO, caixa!, 'ENVIADO', '2026-11-20'))).code).toBe('P0409');
    const [emTransito] = await lista(MARIA);
    expect(
      (await pgError(marcar(MARIA, { ...emTransito!, version: 0 }, 'ENTREGUE', '2026-11-21'))).code,
    ).toBe('P0409');
    const semForm = await inscricao({});
    expect(
      (
        await pgError(
          marcar(
            MARIA,
            { inscricao_id: semForm, tipo: 'CAIXA', envio_id: null, version: 0 },
            'ENVIADO',
            '2026-11-20',
          ),
        )
      ).code,
    ).toBe('P0002');
    await owner`update mentoria_inscricoes set status = 'CANCELADO' where id = ${id}`;
    expect((await pgError(marcar(MARIA, emTransito!, 'ENTREGUE', '2026-11-21'))).code).toBe(
      'P0002',
    );
  });

  it('regras: data obrigatória, recebimento depois do envio, entregue só depois de enviado', async () => {
    const id = await inscricao({ status: 'ATIVO' });
    await owner`insert into mentoria_envios_fisicos (inscricao_id, tipo) values (${id}, 'KIT')`;
    const [kit] = await lista(MARIA);
    expect((await pgError(marcar(MARIA, kit!, 'ENVIADO', null))).message).toBe(
      'Informe a data de envio',
    );
    expect((await pgError(marcar(MARIA, kit!, 'ENTREGUE', '2026-11-20'))).message).toBe(
      'Marque como enviado antes',
    );
    await marcar(MARIA, kit!, 'ENVIADO', '2026-11-20');
    const [emTransito] = await lista(MARIA);
    expect((await pgError(marcar(MARIA, emTransito!, 'ENTREGUE', '2026-11-19'))).message).toBe(
      'O recebimento não pode ser antes do envio',
    );
    expect((await pgError(marcar(MARIA, emTransito!, 'ENVIADO', '2026-11-20'))).message).toBe(
      'Este envio já foi marcado como enviado',
    );
  });

  it('a Especialista não marca (42501)', async () => {
    await inscricao({ formulario: true });
    const [caixa] = await lista(MARIA);
    expect((await pgError(marcar(MANU, caixa!, 'ENVIADO', '2026-11-20'))).code).toBe('42501');
  });
});

describe('push das 8h (M6)', () => {
  const candidatos = async (agora: string) =>
    owner<{ chave: string; quando: string; user_ids: string[] }[]>`
      select chave, quando, user_ids from mentoria_avisos_candidatos(${agora}::timestamptz)
      where chave like 'envios:%'`;

  it('"envios:<dia>" às 8h para quem tem o cargo Envios, só com algo a enviar', async () => {
    expect(await candidatos(AGORA)).toEqual([]);
    await inscricao({ formulario: true });
    const c = await candidatos(AGORA);
    expect(c.map((x) => [x.chave, x.user_ids])).toEqual([['envios:2026-11-22', [MARIA]]]);
    expect(new Date(c[0]!.quando).toISOString()).toBe('2026-11-22T11:00:00.000Z');
  });
});
