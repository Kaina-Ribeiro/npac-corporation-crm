import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FichaDTO, HistoricoItem, PainelRenovacoes } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

// NPAC-79 (Duda 1A, 2C, 3B, 4B, 5A, 6A, 7A, 8A; Gabriel G1–G6): renovação na mesma ficha. A aba Renovações e o
// "Registrar renovação" são de Admin e Acompanhamento ("só a carteira" na carteira); desfazer, só a Admin.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla = '';
let HOJE = '';

const comoPerfil = async (perfil: string, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${carla}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${carla}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};

const dia = async (d: number) =>
  (await owner<{ d: string }[]>`select (${HOJE}::date + ${d}::int)::text as d`)[0]!.d;

/** Ficha com término daqui a `terminoDias` (início = término − 12 meses) e as ações do 1º ano. */
const inscricao = async (
  n: number,
  o: { status?: string; mentoria?: string; resp?: string | null; terminoDias?: number } = {},
) => {
  const d = o.terminoDias ?? 20;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
    values ('INDIVIDUAL', ${o.mentoria ?? 'RDV'}, ${o.status ?? 'ATIVO'},
      ((${HOJE}::date + ${d}::int) - interval '12 months')::date, ${HOJE}::date + ${d}::int, ${o.resp ?? null})
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício N${n}`}, ${`mentorado ficticio n${n}`})`;
  await owner`select mentoria_gerar_acoes(${i!.id}::uuid, ${HOJE}::date)`;
  return i!.id;
};

const ficha = async (s: string, insc: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${insc}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as FichaDTO;
};
const renovar = async (s: string, insc: string, b: { mentoria?: string; data?: string } = {}) => {
  const { version } = await ficha(s, insc);
  return h.post(
    `/api/mentoria/inscricoes/${insc}/renovacoes`,
    { version, mentoria: b.mentoria ?? 'RDV', data: b.data ?? HOJE },
    s,
  );
};
const desfazer = async (s: string, insc: string, version?: number) =>
  h.del(
    `/api/mentoria/inscricoes/${insc}/renovacoes/ultima`,
    { version: version ?? (await ficha(s, insc)).version },
    s,
  );
const painel = async (s: string) => {
  const r = await h.get('/api/mentoria/renovacoes', s);
  expect(r.status, r.text).toBe(200);
  return r.body as PainelRenovacoes;
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const [r] = await owner<{ id: string }[]>`select id from "user" where username = 'carla'`;
  carla = r!.id;
  HOJE = (await owner<{ d: string }[]>`select (now() at time zone 'America/Sao_Paulo')::date::text as d`)[0]!.d;
});
afterAll(async () => {
  await owner`delete from mentoria_perfis`;
  await owner`truncate mentoria_inscricoes cascade`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis`;
});

describe('Registrar renovação', () => {
  it('a Admin renova RDV → 2M: término, mentoria, ações do novo ano e o histórico só com nomes', async () => {
    const insc = await inscricao(1);
    const s = await comoPerfil('ACOMPANHAMENTO', true);
    const antes = await ficha(s, insc);
    expect(antes.renovacoes).toEqual([]);
    expect(antes.pode.renovar).toBe(true);
    expect(antes.pode.desfazerRenovacao).toBe(false);

    const r = await renovar(s, insc, { mentoria: '2M' });
    expect(r.status, r.text).toBe(201);
    expect(r.body).toEqual({ version: antes.version + 1 });

    const f = await ficha(s, insc);
    expect(f.mentoria).toBe('2M');
    expect(f.status).toBe('ATIVO');
    const [termino] = await owner<{ d: string }[]>`
      select (${antes.terminoPrevisto}::date + interval '12 months')::date::text as d`;
    expect(f.terminoPrevisto).toBe(termino!.d);
    expect(f.renovacoes).toEqual([
      {
        id: expect.any(String),
        ano: 2,
        data: HOJE,
        mentoriaAnterior: 'RDV',
        mentoriaNova: '2M',
        terminoAnterior: antes.terminoPrevisto,
        terminoNovo: termino!.d,
        registradaPor: 'Carla',
      },
    ]);
    expect(f.acoes.filter((a) => a.mes >= 13).map((a) => a.mes)).toEqual([13, 13, 19, 25]);
    expect(f.acoes.filter((a) => a.mes <= 12)).toHaveLength(12);
    expect(f.pode.desfazerRenovacao).toBe(true);

    const hist = await h.get(`/api/mentoria/inscricoes/${insc}/historico`, s);
    const itens = (hist.body as { itens: HistoricoItem[] }).itens;
    expect(itens.find((i) => i.tipo === 'inscricao.renovada')?.campos).toEqual([
      'terminoPrevisto',
      'mentoria',
      'acoes',
    ]);
  });

  it('clique duplo: a mesma versão dá 409 e não renova duas vezes', async () => {
    const insc = await inscricao(1);
    const s = await comoPerfil('ACOMPANHAMENTO');
    const { version } = await ficha(s, insc);
    const corpo = { version, mentoria: 'RDV', data: HOJE };
    const url = `/api/mentoria/inscricoes/${insc}/renovacoes`;
    expect((await h.post(url, corpo, s)).status).toBe(201);
    const r = await h.post(url, corpo, s);
    expect(r.status, r.text).toBe(409);
    expect((await ficha(s, insc)).renovacoes).toHaveLength(1);
  });

  it('400: data futura ou de mais de 1 ano, mentoria fora da lista, ficha fora de Ativo/Concluído', async () => {
    const insc = await inscricao(1);
    const s = await comoPerfil('ACOMPANHAMENTO');
    const futura = await renovar(s, insc, { data: await dia(1) });
    expect(futura.status).toBe(400);
    expect(futura.body.message).toBe(
      'A data da renovação não pode ser futura nem de mais de 1 ano atrás.',
    );
    expect((await renovar(s, insc, { data: await dia(-367) })).status).toBe(400);
    expect((await renovar(s, insc, { mentoria: 'XYZ' })).status).toBe(400);
    expect((await renovar(s, insc, { data: '2026-02-30' })).status).toBe(400);

    await owner`update mentoria_inscricoes set status = 'CANCELADO' where id = ${insc}`;
    const cancelada = await renovar(s, insc);
    expect(cancelada.status).toBe(400);
    expect(cancelada.body.message).toBe('Só ficha ativa ou concluída pode ser renovada.');
    expect((await ficha(s, insc)).pode.renovar).toBe(false);
  });

  it('Concluído volta a Ativo', async () => {
    const insc = await inscricao(1, { terminoDias: -3 });
    const s = await comoPerfil('ACOMPANHAMENTO');
    const { version } = await ficha(s, insc);
    const p = await h.patch(`/api/mentoria/inscricoes/${insc}`, { version, status: 'CONCLUIDO' }, s);
    expect(p.status, p.text).toBe(200);
    expect((await ficha(s, insc)).pode.renovar).toBe(true);
    expect((await renovar(s, insc)).status).toBe(201);
    expect((await ficha(s, insc)).status).toBe('ATIVO');
  });

  it('"Renovado" não é escolha manual no status', async () => {
    const insc = await inscricao(1);
    const s = await comoPerfil('ACOMPANHAMENTO', true);
    const { version } = await ficha(s, insc);
    const r = await h.patch(`/api/mentoria/inscricoes/${insc}`, { version, status: 'RENOVADO' }, s);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Para renovar, use Registrar renovação.');
    // Quem já está em "Renovado" continua editável.
    await owner`update mentoria_inscricoes set status = 'RENOVADO' where id = ${insc}`;
    const f = await ficha(s, insc);
    const v = await h.patch(
      `/api/mentoria/inscricoes/${insc}`,
      { version: f.version, mentoriaVariante: '2 encontros' },
      s,
    );
    expect(v.status, v.text).toBe(200);
  });
});

describe('Desfazer', () => {
  it('a Admin desfaz a última; a ficha volta como era', async () => {
    const insc = await inscricao(1);
    const s = await comoPerfil('ACOMPANHAMENTO', true);
    const antes = await ficha(s, insc);
    expect((await renovar(s, insc, { mentoria: '6M' })).status).toBe(201);
    const r = await desfazer(s, insc);
    expect(r.status, r.text).toBe(200);
    const f = await ficha(s, insc);
    expect(f.mentoria).toBe('RDV');
    expect(f.terminoPrevisto).toBe(antes.terminoPrevisto);
    expect(f.renovacoes).toEqual([]);
    expect(f.acoes.map((a) => a.mes)).toEqual(antes.acoes.map((a) => a.mes));
    const hist = await h.get(`/api/mentoria/inscricoes/${insc}/historico`, s);
    expect(
      (hist.body as { itens: HistoricoItem[] }).itens.some(
        (i) => i.tipo === 'inscricao.renovacao_desfeita',
      ),
    ).toBe(true);
  });

  it('versão velha 409; sem renovação ou com ação do novo ano feita, 400', async () => {
    const insc = await inscricao(1);
    const s = await comoPerfil('ACOMPANHAMENTO', true);
    const sem = await desfazer(s, insc);
    expect(sem.status).toBe(400);
    expect(sem.body.message).toBe('Esta ficha não tem renovação para desfazer.');

    expect((await renovar(s, insc, { mentoria: '2M' })).status).toBe(201);
    const { version } = await ficha(s, insc);
    expect((await desfazer(s, insc, version - 1)).status).toBe(409);
    await owner`update mentoria_acoes set status = 'FEITA'
      where inscricao_id = ${insc} and mes = 19`;
    expect((await ficha(s, insc)).pode.desfazerRenovacao).toBe(false);
    const feita = await desfazer(s, insc);
    expect(feita.status).toBe(400);
    expect(feita.body.message).toBe(
      'Uma ação do novo ano já foi feita: a renovação não pode mais ser desfeita.',
    );
  });

  it('o Acompanhamento renova mas não desfaz (404)', async () => {
    const insc = await inscricao(1);
    const s = await comoPerfil('ACOMPANHAMENTO');
    expect((await renovar(s, insc)).status).toBe(201);
    expect((await ficha(s, insc)).pode.desfazerRenovacao).toBe(false);
    expect((await desfazer(s, insc)).status).toBe(404);
    expect((await ficha(s, insc)).renovacoes).toHaveLength(1);
  });
});

describe('aba Renovações', () => {
  it('lista, situação da conversa, rótulo do mês e números', async () => {
    const chegando = await inscricao(1, { terminoDias: 40 });
    const passou = await inscricao(2, { terminoDias: -2 });
    await inscricao(3, { terminoDias: 200 }); // longe: fora
    const renovada = await inscricao(4, { terminoDias: 5 });
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status, interesse_renovar)
      values (${chegando}, 'RENOVACAO', ${carla}, now() - interval '2 days', 'REALIZADA', true)`;
    const s = await comoPerfil('ACOMPANHAMENTO', true);
    expect((await renovar(s, renovada, { mentoria: '2M', data: await dia(-1) })).status).toBe(201);

    const p = await painel(s);
    expect(p.hoje).toBe(HOJE);
    expect(p.itens.map((i) => i.inscricaoId)).toEqual([passou, chegando, renovada]);
    const c = p.itens.find((i) => i.inscricaoId === chegando)!;
    expect(c).toMatchObject({ situacao: 'QUER_RENOVAR', situacaoRotulo: 'Quer renovar', ano: 1 });
    expect(c.mesRotulo).toMatch(/^(Mês 12 de 12|O 12º mês começa em \d{2}\/\d{2})$/);
    const t = p.itens.find((i) => i.inscricaoId === passou)!;
    expect(t).toMatchObject({ situacao: 'SEM_REUNIAO', situacaoRotulo: 'Sem reunião' });
    expect(t.mesRotulo).toBe(`Terminou em ${t.terminoPrevisto.slice(8, 10)}/${t.terminoPrevisto.slice(5, 7)}`);
    const ontem = await dia(-1);
    expect(p.itens.find((i) => i.inscricaoId === renovada)).toMatchObject({
      situacao: 'RENOVOU',
      situacaoRotulo: `Renovou para 2M em ${ontem.slice(8, 10)}/${ontem.slice(5, 7)}`,
      ano: 2,
    });
    expect(p.numeros).toEqual({
      chegando: 2,
      jaTiveramReuniao: 1,
      renovaram: 1,
      naoRenovaram: 0,
      pct: 100,
    });
  });

  it('"só a carteira" vê e renova só a carteira', async () => {
    const minha = await inscricao(1, { resp: carla });
    const outra = await inscricao(2);
    const s = await comoPerfil('ACOMPANHAMENTO');
    await owner`update area_membros set alcance = 'CARTEIRA'
      where user_id = ${carla} and area = 'ACOMPANHAMENTO'`;
    expect((await painel(s)).itens.map((i) => i.inscricaoId)).toEqual([minha]);
    expect((await renovar(s, minha)).status).toBe(201);
    const r = await h.post(
      `/api/mentoria/inscricoes/${outra}/renovacoes`,
      { version: 1, mentoria: 'RDV', data: HOJE },
      s,
    );
    expect(r.status).toBe(404);
  });

  it('Operação vê o selo na ficha, mas não a aba nem o botão (404)', async () => {
    const insc = await inscricao(1);
    const admin = await comoPerfil('ACOMPANHAMENTO', true);
    expect((await renovar(admin, insc)).status).toBe(201);
    const s = await comoPerfil('OPERACAO');
    expect((await h.get('/api/mentoria/renovacoes', s)).status).toBe(404);
    const f = await ficha(s, insc);
    expect(f.renovacoes).toHaveLength(1);
    expect(f.pode.renovar).toBe(false);
    expect(f.pode.desfazerRenovacao).toBe(false);
    expect((await renovar(s, insc)).status).toBe(404);
    expect((await desfazer(s, insc)).status).toBe(404);
  });

  it('Especialista e Mentor: 404 na aba', async () => {
    for (const perfil of ['ESPECIALISTA', 'MENTOR']) {
      const s = await comoPerfil(perfil);
      expect({ perfil, status: (await h.get('/api/mentoria/renovacoes', s)).status }).toEqual({
        perfil,
        status: 404,
      });
    }
  });
});
