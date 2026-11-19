import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CheckinDTO, CicloDTO, FichaDTO, MetaDTO, PaginaInscricoes } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AvisosScheduler } from '../src/mentoria/avisos.scheduler.js';
import { MENTORIA_CLOCK } from '../src/mentoria/relogio.js';
import {
  api,
  closeTestApp,
  createTestApp,
  owner,
  resetAuthState,
  type FakeClock,
} from './helpers.js';

// Fase 2, Parte 3: check-in, semáforo, histórico, status da meta e segunda chance (spec 2026-11-11,
// E9–E16, §5, §8). Datas fixas: entrada no ar na quarta 18/11/2026; o relógio do módulo na terça
// 08/12 ao meio-dia de Brasília. Semanas: 16/11, 23/11, 30/11, 07/12.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let relogio: FakeClock;
let desdeOriginal: string;
const ids: Record<string, string> = {};

const DESDE = '2026-11-18';
const em = (dia: string, hora = '12:00') => Date.parse(`${dia}T${hora}:00-03:00`);
const HOJE = em('2026-12-08');

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

let n = 0;
const inscricao = async (status = 'ATIVO', inicio = '2026-10-01') => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto)
    values ('INDIVIDUAL', 'RDV', ${status}, ${inicio}::date, '2027-10-01') returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  return i!.id;
};
const ficha = async (s: string, id: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${id}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as FichaDTO;
};
const lancar = (s: string, insc: string, b: object) =>
  h.post(`/api/mentoria/inscricoes/${insc}/checkins`, b, s);
const lancarOk = async (s: string, insc: string, b: object) => {
  const r = await lancar(s, insc, b);
  expect(r.status, r.text).toBe(201);
  return r.body as CheckinDTO;
};
/** Check-in respondido na quarta da semana da segunda `semana`. */
const respondido = (s: string, insc: string, quarta: string) =>
  lancarOk(s, insc, {
    enviadoEm: `${quarta}T09:00`,
    respondeu: true,
    respondidoEm: `${quarta}T18:00`,
  });
/** Tarefa da reunião com prazo e status (pelo owner: o resultado é marcado à parte). */
const tarefa = async (insc: string, prazo: string, status = 'PENDENTE') => {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status)
    values (${insc}, 'POSICIONAMENTO', ${ids.diretor!}, '2026-11-20T12:00:00Z', 'REALIZADA')
    returning id`;
  const [t] = await owner<{ id: string; version: number }[]>`
    insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, descricao, prazo, status)
    values (${insc}, 'REUNIAO', ${r!.id}, null, ${prazo}, ${status}) returning id, version`;
  return t!;
};
const enviarPme = async (s: string, insc: string, enviadoEm: string) => {
  const r = await h.post(`/api/mentoria/inscricoes/${insc}/ciclos`, { enviadoEm }, s);
  expect(r.status, r.text).toBe(201);
  return r.body as CicloDTO;
};
const lista = async (s: string, b: object = {}) => {
  const r = await h.post('/api/mentoria/inscricoes/lista', b, s);
  expect(r.status, r.text).toBe(200);
  return r.body as PaginaInscricoes;
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  relogio = app.get(MENTORIA_CLOCK);
  for (const u of ['carla', 'diretor']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
  const [d] = await owner<{ desde: string }[]>`
    select to_char(desde, 'YYYY-MM-DD') as desde from mentoria_semaforo_inicio`;
  desdeOriginal = d!.desde;
  // Os pmes 1 e 2 vêm da migration (0057).
});
afterAll(async () => {
  await owner`update mentoria_semaforo_inicio set desde = ${desdeOriginal}`;
  await owner`delete from mentoria_perfis`;
  await owner`truncate mentoria_inscricoes cascade`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis`;
  await owner`update mentoria_semaforo_inicio set desde = ${DESDE}`;
  relogio.set(HOJE);
});

describe('semáforo na ficha', () => {
  it('check-in: 2 semanas sem resposta = vermelho; com resposta, verde e a sequência', async () => {
    const i = await inscricao();
    const s = await duda();
    let f = await ficha(s, i);
    expect(f.semaforo).toEqual({ cor: 'VERMELHO', motivos: ['CHECKIN_2'] });
    expect(f.sequenciaCheckins).toBe(0);
    // Enviado sem resposta não salva a semana (E11).
    await lancarOk(s, i, { enviadoEm: '2026-11-25T09:00' });
    f = await ficha(s, i);
    expect(f.semaforo?.cor).toBe('VERMELHO');
    await respondido(s, i, '2026-12-02');
    f = await ficha(s, i);
    expect(f.semaforo).toEqual({ cor: 'VERDE', motivos: [] });
    expect(f.sequenciaCheckins).toBe(1);
    expect(f.checkins.map((c) => [c.semana, c.respondeu])).toEqual([
      ['2026-11-30', true],
      ['2026-11-23', false],
    ]);
  });

  it('tarefa: PENDENTE vencida conta (E12); PARCIAL não; 2 não feitas = vermelho', async () => {
    const i = await inscricao();
    const s = await duda();
    await respondido(s, i, '2026-11-25');
    await respondido(s, i, '2026-12-02');
    const t = await tarefa(i, '2026-12-05');
    expect((await ficha(s, i)).semaforo).toEqual({ cor: 'AMARELO', motivos: ['TAREFA_1'] });
    const r = await h.patch(
      `/api/mentoria/tarefas/${t.id}`,
      { version: t.version, status: 'PARCIAL' },
      s,
    );
    expect(r.status, r.text).toBe(200);
    expect((await ficha(s, i)).semaforo).toEqual({ cor: 'VERDE', motivos: [] });
    await tarefa(i, '2026-12-06', 'NAO_FEITA');
    await tarefa(i, '2026-12-07', 'NAO_FEITA');
    expect((await ficha(s, i)).semaforo).toEqual({ cor: 'VERMELHO', motivos: ['TAREFA_2'] });
  });

  it('PME atrasado: 15 dias = vermelho; a segunda chance adia e mostra o status (E15, E16)', async () => {
    const i = await inscricao();
    const s = await duda();
    await respondido(s, i, '2026-11-25');
    await respondido(s, i, '2026-12-02');
    const c = await enviarPme(s, i, '2026-10-20'); // prazo 19/11, 19 dias de atraso
    expect(c).toMatchObject({ status: 'EM_ANDAMENTO', diasAtraso: 19, segundaChanceAte: null });
    expect((await ficha(s, i)).semaforo).toEqual({ cor: 'VERMELHO', motivos: ['PME_15'] });

    const dar = (sessao: string, b: object) => h.patch(`/api/mentoria/ciclos/${c.id}`, b, sessao);
    expect((await dar(s, { version: c.version, segundaChanceAte: '2026-11-19' })).status).toBe(400);
    expect((await dar(s, { version: c.version, segundaChanceAte: '2026-12-07' })).status).toBe(400);
    const so = await operacao();
    expect((await dar(so, { version: c.version, segundaChanceAte: '2026-12-15' })).status).toBe(
      404,
    );
    const s2 = await duda();
    const r = await dar(s2, { version: c.version, segundaChanceAte: '2026-12-15' });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({
      status: 'SEGUNDA_CHANCE',
      segundaChanceAte: '2026-12-15',
      diasAtraso: 0,
    });
    let f = await ficha(s2, i);
    expect(f.semaforo).toEqual({ cor: 'VERDE', motivos: [] });
    expect(f.pode.segundaChance).toBe(true);
    const [hist] = await owner<{ tipo: string; campos: string[] }[]>`
      select tipo, campos from mentoria_historico
      where inscricao_id = ${i} and tipo = 'pme.segunda_chance'`;
    expect(hist).toEqual({ tipo: 'pme.segunda_chance', campos: ['pme_1', 'segundaChanceAte'] });

    // Passou a segunda chance: em andamento, o atraso conta do novo prazo.
    relogio.set(em('2026-12-22'));
    await respondido(s2, i, '2026-12-09');
    await respondido(s2, i, '2026-12-16');
    f = await ficha(s2, i);
    expect(f.ciclos[0]).toMatchObject({ status: 'EM_ANDAMENTO', diasAtraso: 7 });
    expect(f.semaforo).toEqual({ cor: 'AMARELO', motivos: ['PME_7'] });
    expect((await ficha(await operacao(), i)).pode.segundaChance).toBe(false);
  });

  it('na entrada no ar todo mundo começa verde', async () => {
    await owner`update mentoria_semaforo_inicio set desde = '2026-12-08'`;
    const i = await inscricao();
    const s = await duda();
    await enviarPme(s, i, '2026-10-01');
    await tarefa(i, '2026-12-01');
    expect((await ficha(s, i)).semaforo).toEqual({ cor: 'VERDE', motivos: [] });
  });

  it('pausado não tem semáforo; Especialista não vê semáforo nem check-ins', async () => {
    const pausado = await inscricao('PAUSADO');
    const s = await duda();
    expect((await ficha(s, pausado)).semaforo).toBeNull();

    const i = await inscricao();
    await respondido(s, i, '2026-12-02');
    await owner`insert into mentoria_semaforo_historico (inscricao_id, semana, cor)
      values (${i}, '2026-11-30', 'VERDE')`;
    const so = await operacao();
    const fo = await ficha(so, i);
    expect(fo.semaforo).toEqual({ cor: 'VERDE', motivos: [] });
    expect(fo.checkins).toHaveLength(1);
    expect(fo.semaforoHistorico).toHaveLength(1);
    expect(fo.pode.checkin).toBe(false);

    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${i}, 'POSICIONAMENTO', ${ids.carla!}, now() - interval '1 hour')`;
    const sm = await manu();
    const fm = await ficha(sm, i);
    expect(fm.semaforo).toBeNull();
    expect(fm.checkins).toEqual([]);
    expect(fm.semaforoHistorico).toEqual([]);
    expect(fm.sequenciaCheckins).toBeNull();
    expect((await lista(sm)).itens[0]?.semaforo).toBeNull();
  });
});

describe('check-ins (E9)', () => {
  it('Admin e Acompanhamento lançam e editam; Operação e Especialista não', async () => {
    const i = await inscricao();
    const s = await duda();
    const c = await lancarOk(s, i, { enviadoEm: '2026-12-07T10:00' });
    expect(c).toMatchObject({ semana: '2026-12-07', respondeu: false, respondidoEm: null });
    // Uma por semana.
    expect((await lancar(s, i, { enviadoEm: '2026-12-08T08:00' })).status).toBe(409);
    // Resposta: data obrigatória, nada no futuro, nunca antes do envio.
    const patch = (b: object, sessao = s) => h.patch(`/api/mentoria/checkins/${c.id}`, b, sessao);
    expect((await patch({ version: c.version, respondeu: true })).status).toBe(400);
    expect(
      (await patch({ version: c.version, respondeu: true, respondidoEm: '2026-12-09T10:00' }))
        .status,
    ).toBe(400);
    expect(
      (await patch({ version: c.version, respondeu: true, respondidoEm: '2026-12-07T09:00' }))
        .status,
    ).toBe(400);
    expect((await lancar(s, i, { enviadoEm: '2026-12-14T10:00' })).status).toBe(400);
    const r = await patch({
      version: c.version,
      respondeu: true,
      respondidoEm: '2026-12-07T21:30',
      avanco: 'Guardou a reserva da semana',
      travou: 'Viagem',
      proximoPasso: 'Planilha de gastos',
    });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({
      respondeu: true,
      respondidoEm: '2026-12-08T00:30:00.000Z',
      avanco: 'Guardou a reserva da semana',
      travou: 'Viagem',
      proximoPasso: 'Planilha de gastos',
    });
    // Texto cifrado no banco.
    const [raw] = await owner<{ avanco: string }[]>`
      select avanco from mentoria_checkins where id = ${c.id}`;
    expect(raw!.avanco).not.toContain('reserva');
    expect((await patch({ version: c.version, travou: 'x' })).status).toBe(409);

    const so = await operacao();
    expect((await lancar(so, i, { enviadoEm: '2026-11-30T10:00' })).status).toBe(404);
    expect((await patch({ version: 2, travou: 'x' }, so)).status).toBe(404);
    const sm = await manu();
    expect((await lancar(sm, i, { enviadoEm: '2026-11-30T10:00' })).status).toBe(404);

    const hist = await owner<{ tipo: string; campos: string[] }[]>`
      select tipo, campos from mentoria_historico where inscricao_id = ${i} order by id`;
    expect(hist).toEqual([
      { tipo: 'checkin.lancado', campos: ['enviadoEm'] },
      {
        tipo: 'checkin.editado',
        campos: ['respondeu', 'respondidoEm', 'avanco', 'travou', 'proximoPasso'],
      },
    ]);
  });
});

describe('status da meta (E10)', () => {
  it('Acompanhamento marca atingida, não atingida ou nada; Operação não', async () => {
    const i = await inscricao();
    const s = await duda();
    const nova = await h.post(`/api/mentoria/inscricoes/${i}/metas`, { descricao: 'Reserva' }, s);
    expect(nova.status, nova.text).toBe(201);
    const m = nova.body as MetaDTO;
    expect(m.status).toBeNull();
    const r = await h.patch(`/api/mentoria/metas/${m.id}`, { version: 1, status: 'ATINGIDA' }, s);
    expect(r.status, r.text).toBe(200);
    expect((await ficha(s, i)).metas[0]).toMatchObject({ status: 'ATINGIDA', pct: null });
    expect(
      (await h.patch(`/api/mentoria/metas/${m.id}`, { version: 2, status: null }, s)).status,
    ).toBe(200);
    const so = await operacao();
    expect(
      (await h.patch(`/api/mentoria/metas/${m.id}`, { version: 3, status: 'ATINGIDA' }, so)).status,
    ).toBe(404);
  });
});

describe('Mentorados: colunas e filtro', () => {
  it('PME atual, semáforo e % do PME; filtro por semáforo', async () => {
    const vermelho = await inscricao();
    const verde = await inscricao();
    const s = await duda();
    for (const q of ['2026-11-25', '2026-12-02']) await respondido(s, verde, q);
    const c = await enviarPme(s, verde, '2026-12-01');
    const pausado = await inscricao('PAUSADO');

    const tudo = await lista(s);
    const item = (id: string) => tudo.itens.find((x) => x.id === id)!;
    expect(item(vermelho).semaforo).toEqual({ cor: 'VERMELHO', motivos: ['CHECKIN_2'] });
    expect(item(vermelho).pme).toBeNull();
    expect(item(verde).semaforo).toEqual({ cor: 'VERDE', motivos: [] });
    expect(item(verde).pme).toEqual({
      numero: 1,
      status: 'EM_ANDAMENTO',
      diasAtraso: 0,
      pctTarefas: 0,
    });
    expect(c.tarefas.length).toBeGreaterThan(0);
    expect(item(pausado).semaforo).toBeNull();

    const so = await operacao();
    const vermelhos = await lista(so, { semaforo: 'VERMELHO' });
    expect(vermelhos.itens.map((x) => x.id)).toEqual([vermelho]);
    expect(vermelhos.total).toBe(1);
    expect((await lista(so, { semaforo: 'VERDE' })).itens.map((x) => x.id)).toEqual([verde]);
    expect((await h.post('/api/mentoria/inscricoes/lista', { semaforo: 'AZUL' }, so)).status).toBe(
      400,
    );
  });
});

describe('histórico semanal', () => {
  it('grava na virada da semana e ao subir, uma vez só; o timer acorda na segunda', async () => {
    const i = await inscricao();
    const pausado = await inscricao('PAUSADO');
    const avisos = app.get(AvisosScheduler);
    const semanas = async (id: string) =>
      (
        await owner<{ semana: string; cor: string }[]>`
          select to_char(semana, 'YYYY-MM-DD') as semana, cor from mentoria_semaforo_historico
          where inscricao_id = ${id} order by semana`
      ).map((r) => `${r.semana} ${r.cor}`);

    // Ao subir (o disparo do bootstrap): completa as semanas desde a entrada no ar.
    await avisos.fire();
    await avisos.settled();
    expect(await semanas(i)).toEqual([
      '2026-11-16 VERDE',
      '2026-11-23 AMARELO',
      '2026-11-30 VERMELHO',
    ]);
    expect(await semanas(pausado)).toEqual([]);
    await avisos.fire();
    await avisos.settled();
    expect(await semanas(i)).toHaveLength(3);

    // O próximo disparo armado não passa da segunda 14/12 00:00 de Brasília.
    expect(avisos.armedAt).not.toBeNull();
    expect(avisos.armedAt!).toBeLessThanOrEqual(em('2026-12-14', '00:00'));
    relogio.advanceTo(em('2026-12-14', '00:00'));
    await avisos.settled();
    await avisos.fire();
    await avisos.settled();
    expect((await semanas(i)).at(-1)).toBe('2026-12-07 VERMELHO');
    expect(await semanas(i)).toHaveLength(4);

    const s = await duda();
    const f = await ficha(s, i);
    expect(f.semaforoHistorico.map((x) => x.semana)).toEqual([
      '2026-12-07',
      '2026-11-30',
      '2026-11-23',
      '2026-11-16',
    ]);
  });
});
