import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CicloDTO, FichaDTO, MetaDTO, ReuniaoDTO, TarefaDTO } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENTORIA_CLOCK } from '../src/mentoria/relogio.js';
import {
  api,
  closeTestApp,
  createTestApp,
  owner,
  resetAuthState,
  type FakeClock,
} from './helpers.js';

// Fase 2, Parte 2: metas, tarefas da reunião, cobrança e % do PME (spec 2026-11-11, §3, §4, §8).
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let relogio: FakeClock;
const ids: Record<string, string> = {};

/** Reuniões e prazos usam o dia real (o horário da reunião é do banco); o PME, o relógio. */
const AGORA = Date.now();
const DIA = 86_400_000;
const dia = (n: number) => new Date(AGORA + n * DIA - 3 * 3_600_000).toISOString().slice(0, 10);
const PRAZO = dia(7);

const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${ids.carla!}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};
const duda = () => comoPerfil('ACOMPANHAMENTO');
const operacao = () => comoPerfil('OPERACAO');
const manu = () => comoPerfil('ESPECIALISTA');
const leo = () => comoPerfil('MENTOR');
const diretor = () => h.signIn('diretor@npac.com.br');

let n = 0;
const inscricao = async (tipo: 'INDIVIDUAL' | 'CASAL' = 'INDIVIDUAL') => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto)
    values (${tipo}, 'RDV', 'ATIVO', ${dia(-60)}::date, ${dia(300)}::date) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  if (tipo === 'CASAL')
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${i!.id}, 2, ${`Parceira Fictícia ${n}`}, ${`parceira ficticia ${n}`})`;
  return i!.id;
};
/** Reunião `horas` atrás (negativo = futura), conduzida por `quem`. */
const reuniao = async (
  insc: string,
  quem: string,
  horas = 1,
  status = 'REALIZADA',
): Promise<string> => {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status)
    values (${insc}, 'POSICIONAMENTO', ${quem}, now() - ${`${horas} hours`}::interval, ${status})
    returning id`;
  return r!.id;
};

const abrirReuniao = async (s: string, id: string) => {
  const r = await h.get(`/api/mentoria/reunioes/${id}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as ReuniaoDTO;
};
const ficha = async (s: string, id: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${id}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as FichaDTO;
};
const combinar = (s: string, reuniaoId: string, b: object = {}) =>
  h.post(
    `/api/mentoria/reunioes/${reuniaoId}/tarefas`,
    { descricao: 'Ler 10 páginas', prazo: PRAZO, ...b },
    s,
  );
const combinarOk = async (s: string, reuniaoId: string, b: object = {}) => {
  const r = await combinar(s, reuniaoId, b);
  expect(r.status, r.text).toBe(201);
  return r.body as TarefaDTO;
};
const novaMeta = (s: string, insc: string, b: object = {}) =>
  h.post(`/api/mentoria/inscricoes/${insc}/metas`, { descricao: 'Juntar a reserva', ...b }, s);
const novaMetaOk = async (s: string, insc: string, b: object = {}) => {
  const r = await novaMeta(s, insc, b);
  expect(r.status, r.text).toBe(201);
  return r.body as MetaDTO;
};
const enviarPme = async (s: string, insc: string) => {
  const r = await h.post(`/api/mentoria/inscricoes/${insc}/ciclos`, {}, s);
  expect(r.status, r.text).toBe(201);
  return r.body as CicloDTO;
};
const historico = async (insc: string) =>
  owner<{ tipo: string; campos: string[] }[]>`
    select tipo, campos from mentoria_historico where inscricao_id = ${insc} order by id`;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  relogio = app.get(MENTORIA_CLOCK);
  for (const u of ['carla', 'diretor']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
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
  relogio.set(AGORA);
});

describe('tarefas da semana', () => {
  it('até 3 por reunião, com prazo; a 4ª dá 400; entra no ciclo aberto', async () => {
    const i = await inscricao();
    const s = await duda();
    const c = await enviarPme(s, i);
    const r = await reuniao(i, ids.diretor!);
    const t = await combinarOk(s, r);
    expect(t).toMatchObject({
      origem: 'REUNIAO',
      reuniaoId: r,
      cicloId: c.id,
      cicloNumero: 1,
      prazo: PRAZO,
      status: 'PENDENTE',
      descricao: 'Ler 10 páginas',
    });
    await combinarOk(s, r);
    await combinarOk(s, r);
    const quarta = await combinar(s, r);
    expect(quarta.status).toBe(400);
    expect(quarta.body.message).toBe('Até 3 tarefas por reunião');
    const [x] = await owner<{ d: string }[]>`
      select descricao as d from mentoria_tarefas where id = ${t.id}`;
    expect(x!.d).not.toContain('Ler');
    const hist = await historico(i);
    expect(hist.filter((e) => e.tipo === 'tarefa.criada')).toHaveLength(3);
    expect(hist.find((e) => e.tipo === 'tarefa.criada')!.campos).toEqual([
      'tarefa_reuniao',
      'descricao',
      'prazo',
    ]);
    const rr = await abrirReuniao(s, r);
    expect(rr.tarefas).toHaveLength(3);
    expect(rr.podeTarefa).toBe(true);
    expect(rr.podeExcluir).toBe(false);
  });

  it('prazo obrigatório; descrição obrigatória', async () => {
    const i = await inscricao();
    const s = await duda();
    const r = await reuniao(i, ids.diretor!);
    expect(
      (await h.post(`/api/mentoria/reunioes/${r}/tarefas`, { descricao: 'x' }, s)).status,
    ).toBe(400);
    expect((await combinar(s, r, { descricao: ' ' })).status).toBe(400);
  });

  it('editar texto, prazo e meta; marcar com motivo; sem rota de excluir', async () => {
    const i = await inscricao();
    const s = await duda();
    const r = await reuniao(i, ids.diretor!);
    const m = await novaMetaOk(s, i);
    const t = await combinarOk(s, r, { metaId: m.id });
    expect(t.metaId).toBe(m.id);
    const ed = await h.patch(
      `/api/mentoria/tarefas/${t.id}`,
      { version: t.version, descricao: 'Ler 20 páginas', prazo: dia(9), metaId: null },
      s,
    );
    expect(ed.status, ed.text).toBe(200);
    const aberta = (await h.get(`/api/mentoria/tarefas/${t.id}`, s)).body as TarefaDTO;
    expect(aberta).toMatchObject({ descricao: 'Ler 20 páginas', prazo: dia(9), metaId: null });
    const marcada = await h.patch(
      `/api/mentoria/tarefas/${t.id}`,
      { version: aberta.version, status: 'NAO_FEITA', motivo: 'Viajou' },
      s,
    );
    expect(marcada.status).toBe(200);
    expect((await h.del(`/api/mentoria/tarefas/${t.id}`, {}, s)).status).toBe(404);
  });

  it('tarefa do ciclo não muda texto nem prazo', async () => {
    const i = await inscricao();
    const s = await duda();
    const c = await enviarPme(s, i);
    const extra = c.tarefas.find((t) => t.origem === 'EXTRA')!;
    const r = await h.patch(
      `/api/mentoria/tarefas/${extra.id}`,
      { version: extra.version, descricao: 'Outra' },
      s,
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Só a tarefa da reunião muda texto, prazo e meta');
  });

  it('reunião com tarefa não é excluída', async () => {
    const i = await inscricao();
    const s = await duda();
    const r = await reuniao(i, ids.diretor!, -24, 'AGENDADA');
    expect((await abrirReuniao(s, r)).podeExcluir).toBe(true);
    await combinarOk(s, r);
    expect((await abrirReuniao(s, r)).podeExcluir).toBe(false);
    expect((await h.del(`/api/mentoria/reunioes/${r}`, {}, s)).status).toBe(400);
  });
});

describe('cobrança da reunião anterior', () => {
  it('traz as tarefas da última reunião realizada antes desta', async () => {
    const i = await inscricao();
    const s = await duda();
    const primeira = await reuniao(i, ids.diretor!, 72);
    const t1 = await combinarOk(s, primeira, { descricao: 'Caminhar' });
    await reuniao(i, ids.diretor!, 60, 'FALTOU'); // não realizada: não conta
    const atual = await reuniao(i, ids.diretor!, 1);
    const rr = await abrirReuniao(s, atual);
    expect(rr.cobranca?.reuniao.id).toBe(primeira);
    expect(rr.cobranca?.tarefas.map((t) => t.descricao)).toEqual(['Caminhar']);
    // A primeira reunião não tem cobrança.
    expect((await abrirReuniao(s, primeira)).cobranca).toBeNull();
    // Cobrar: o resultado aparece na cobrança.
    await h.patch(`/api/mentoria/tarefas/${t1.id}`, { version: t1.version, status: 'PARCIAL' }, s);
    expect((await abrirReuniao(s, atual)).cobranca?.tarefas[0]!.status).toBe('PARCIAL');
    // Uma realizada no meio, sem tarefas, passa a ser a anterior (spec §4, ao pé da letra).
    const meio = await reuniao(i, ids.diretor!, 48);
    const depois = await abrirReuniao(s, atual);
    expect(depois.cobranca?.reuniao.id).toBe(meio);
    expect(depois.cobranca?.tarefas).toEqual([]);
  });

  it('Especialista: só as tarefas e a cobrança das próprias reuniões, sem metas', async () => {
    const i = await inscricao();
    const sd = await duda();
    const daDuda = await reuniao(i, ids.diretor!, 72);
    await combinarOk(sd, daDuda, { descricao: 'Tarefa da Duda' });
    await novaMetaOk(sd, i);
    const s = await manu();
    const dela1 = await reuniao(i, ids.carla!, 48);
    const dela2 = await reuniao(i, ids.carla!, 1);
    // Na reunião dela não há cobrança: a tarefa da Duda é invisível para ela.
    expect((await abrirReuniao(s, dela1)).cobranca).toBeNull();
    await combinarOk(s, dela1, { descricao: 'Tarefa da Manu' });
    const rr = await abrirReuniao(s, dela2);
    expect(rr.cobranca?.reuniao.id).toBe(dela1);
    expect(rr.metasInscricao).toEqual([]);
    expect(rr.podeMeta).toBe(false);
    expect(rr.podeTarefa).toBe(true);
    expect((await combinar(s, daDuda)).status).toBe(404);
    expect((await novaMeta(s, i)).status).toBe(404);
    const f = await ficha(s, i);
    expect(f.metas).toEqual([]);
    expect(f.tarefasReuniao.map((t) => t.descricao)).toEqual(['Tarefa da Manu']);
    expect(f.pode.meta).toBe(false);
  });
});

describe('metas', () => {
  it('Duda cria e edita; Operação lê sem escrever; Mentor fica de fora', async () => {
    const i = await inscricao('CASAL');
    const s = await duda();
    const c = await enviarPme(s, i);
    const r = await reuniao(i, ids.diretor!);
    const f0 = await ficha(s, i);
    const pessoa2 = f0.pessoas.find((p) => p.ordem === 2)!;
    const m = await novaMetaOk(s, i, {
      pilar: 'DINHEIRO',
      pessoaId: pessoa2.id,
      valorAlvo: 10000,
      valorAtual: 2500.5,
      unidade: 'R$',
      prazo: dia(60),
      reuniaoId: r,
    });
    expect(m).toMatchObject({
      cicloId: c.id,
      cicloNumero: 1,
      reuniaoId: r,
      pessoaId: pessoa2.id,
      pilar: 'DINHEIRO',
      valorAlvo: 10000,
      valorAtual: 2500.5,
      descricao: 'Juntar a reserva',
      podeEditar: true,
    });
    const ed = await h.patch(
      `/api/mentoria/metas/${m.id}`,
      { version: m.version, valorAtual: 5000 },
      s,
    );
    expect(ed.status, ed.text).toBe(200);
    expect(
      (await h.patch(`/api/mentoria/metas/${m.id}`, { version: m.version, unidade: 'x' }, s))
        .status,
    ).toBe(409);
    const outra = await inscricao();
    const [p] = await owner<{ id: string }[]>`
      select id from mentoria_pessoas where inscricao_id = ${outra}`;
    expect((await novaMeta(s, i, { pessoaId: p!.id })).status).toBe(400);
    expect((await novaMeta(s, i, { valorAlvo: 0 })).status).toBe(400);
    // Status da meta (S3) espera decisão: o campo não existe.
    expect(
      (await h.patch(`/api/mentoria/metas/${m.id}`, { version: 2, status: 'ATINGIDA' }, s)).status,
    ).toBe(400);

    const so = await operacao();
    const lida = await h.get(`/api/mentoria/metas/${m.id}`, so);
    expect(lida.status).toBe(200);
    expect(lida.body.podeEditar).toBe(false);
    expect((await novaMeta(so, i)).status).toBe(404);
    expect(
      (await h.patch(`/api/mentoria/metas/${m.id}`, { version: 2, unidade: 'x' }, so)).status,
    ).toBe(404);
    expect((await combinar(so, r)).status).toBe(404);
    expect((await ficha(so, i)).metas).toHaveLength(1);
    expect((await h.get(`/api/mentoria/metas/${m.id}`, await leo())).status).toBe(404);

    expect((await h.del(`/api/mentoria/metas/${m.id}`, {}, await duda())).status).toBe(404);
    const hist = await historico(i);
    expect(hist.map((e) => e.tipo)).toEqual(
      expect.arrayContaining(['meta.criada', 'meta.editada']),
    );
    expect(hist.find((e) => e.tipo === 'meta.editada')!.campos).toEqual(['valorAtual']);
    expect(JSON.stringify(hist)).not.toContain('reserva');
  });
});

describe('% do PME', () => {
  it('tarefas FEITA ÷ total (PARCIAL não conta) e metas pelo alvo (sem alvo fica fora)', async () => {
    const i = await inscricao();
    const s = await duda();
    await enviarPme(s, i); // 1º PME: 2 extras + encerramento
    const r = await reuniao(i, ids.diretor!);
    const t1 = await combinarOk(s, r);
    const t2 = await combinarOk(s, r);
    let c = (await ficha(s, i)).ciclos[0]!;
    expect(c.pctTarefas).toBe(0);
    expect(c.pctMetas).toBeNull();
    await h.patch(`/api/mentoria/tarefas/${t1.id}`, { version: t1.version, status: 'FEITA' }, s);
    await h.patch(`/api/mentoria/tarefas/${t2.id}`, { version: t2.version, status: 'PARCIAL' }, s);
    await novaMetaOk(s, i, { valorAlvo: 10, valorAtual: 5 });
    await novaMetaOk(s, i); // sem alvo: fora do % até a decisão (S4)
    c = (await ficha(s, i)).ciclos[0]!;
    expect(c.pctTarefas).toBe(20); // 1 de 5
    expect(c.pctMetas).toBe(50);
    // A Especialista vê o mesmo número, mesmo sem ler as tarefas.
    await reuniao(i, ids.carla!, 2);
    expect((await ficha(await manu(), i)).ciclos[0]!.pctTarefas).toBe(20);
  });
});

describe('LGPD', () => {
  it('anonimizar apaga a descrição das metas', async () => {
    const i = await inscricao();
    await novaMetaOk(await duda(), i);
    const s = await diretor();
    expect((await h.post(`/api/mentoria/inscricoes/${i}/anonimizar`, {}, s)).status).toBeLessThan(
      300,
    );
    expect((await ficha(s, i)).metas[0]!.descricao).toBeNull();
  });
});
