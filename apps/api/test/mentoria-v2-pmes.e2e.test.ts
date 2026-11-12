import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CicloDTO, FichaDTO, TarefaDTO } from '@npac/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENTORIA_CLOCK } from '../src/mentoria/relogio.js';
import {
  api,
  closeTestApp,
  createTestApp,
  ORIGIN,
  owner,
  resetAuthState,
  type FakeClock,
} from './helpers.js';

// Fase 2, Parte 1: catálogo de PMEs, ciclos e tarefas do ciclo (spec 2026-11-11, §3 e §8).
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let relogio: FakeClock;
const ids: Record<string, string> = {};

const DIA = 86_400_000;
/** Quinta, 10/12/2026, 10h de Brasília. */
const AGORA = Date.parse('2026-12-10T10:00:00-03:00');
/** Data de Brasília `n` dias antes de AGORA (negativo = depois). */
const dia = (n: number) => new Date(AGORA - n * DIA - 3 * 3_600_000).toISOString().slice(0, 10);
const HOJE = dia(0);

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
const diretor = () => h.signIn('diretor@npac.com.br');

let n = 0;
const inscricao = async (opts: { status?: string; importada?: boolean; termino?: string } = {}) => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, importada, inicio_jornada, termino_previsto)
    values ('INDIVIDUAL', 'RDV', ${opts.status ?? 'ATIVO'}, ${opts.importada ?? false},
      ${dia(60)}::date, ${opts.termino ?? dia(-300)}::date) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  return i!.id;
};

const ficha = async (s: string, id: string) => {
  const r = await h.get(`/api/mentoria/inscricoes/${id}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as FichaDTO;
};
const enviar = (s: string, id: string, b: object = {}) =>
  h.post(`/api/mentoria/inscricoes/${id}/ciclos`, b, s);
const enviarOk = async (s: string, id: string, b: object = {}) => {
  const r = await enviar(s, id, b);
  expect(r.status, r.text).toBe(201);
  return r.body as CicloDTO;
};
const marcar = (s: string, t: { id: string; version: number }, b: object) =>
  h.patch(`/api/mentoria/tarefas/${t.id}`, { version: t.version, ...b }, s);
const tarefa = async (s: string, id: string) => {
  const r = await h.get(`/api/mentoria/tarefas/${id}`, s);
  expect(r.status, r.text).toBe(200);
  return r.body as TarefaDTO;
};
const encerramento = (c: CicloDTO) => c.tarefas.find((t) => t.origem === 'ENCERRAMENTO')!;

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
  await owner`delete from mentoria_pmes where numero not in (1, 2)`;
  await owner`update mentoria_pmes set ativo = true, titulo = null`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis`;
  await owner`delete from mentoria_pmes where numero not in (1, 2)`;
  await owner`update mentoria_pmes set ativo = true, titulo = null`;
  relogio.set(AGORA);
});

describe('catálogo de PMEs', () => {
  it('só Admin lê e edita; número novo é criado e o número não muda', async () => {
    expect((await h.get('/api/mentoria/pmes', await operacao())).status).toBe(404);
    expect((await h.get('/api/mentoria/pmes', await duda())).status).toBe(404);
    const s = await diretor();
    const lista = (await h.get('/api/mentoria/pmes', s)).body as { numero: number }[];
    expect(lista.map((p) => p.numero)).toEqual([1, 2]);
    const novo = await h.put('/api/mentoria/pmes', { numero: 3, titulo: 'Reserva' }, s);
    expect(novo.status, novo.text).toBe(200);
    const ed = await h.put(
      '/api/mentoria/pmes',
      { id: novo.body.id, version: 1, atividadesExtras: ['Ler um livro'] },
      s,
    );
    expect(ed.body.version).toBe(2);
    const muda = await h.put('/api/mentoria/pmes', { id: novo.body.id, version: 2, numero: 4 }, s);
    expect(muda.status).toBe(400);
    const repetido = await h.put('/api/mentoria/pmes', { numero: 3 }, s);
    expect(repetido.status).toBe(409);
    const velho = await h.put('/api/mentoria/pmes', { id: novo.body.id, version: 1, foco: 'x' }, s);
    expect(velho.status).toBe(409);
  });
});

describe('envio do PME', () => {
  it('cria o ciclo do número seguinte com as extras e o encerramento, prazo de 30 dias', async () => {
    const i = await inscricao();
    const s = await operacao();
    const c = await enviarOk(s, i);
    expect(c).toMatchObject({
      numero: 1,
      enviadoEm: HOJE,
      prazo: dia(-30),
      status: 'EM_ANDAMENTO',
      diasAtraso: 0,
    });
    expect(c.tarefas.map((t) => t.origem)).toEqual(['EXTRA', 'EXTRA', 'ENCERRAMENTO']);
    expect(c.tarefas.every((t) => t.prazo === dia(-30) && t.status === 'PENDENTE')).toBe(true);
    expect(c.tarefas[0]!.descricao).toMatch(/Millionaire Book/);
    expect(encerramento(c).descricao).toMatch(/queimá-las/);
    // Texto cifrado no banco; o 1º PME marca o item da Fase 1.
    const [t] = await owner<{ d: string }[]>`select descricao as d from mentoria_tarefas limit 1`;
    expect(t!.d).not.toMatch(/Millionaire/);
    const [x] = await owner<{ em: Date | null }[]>`
      select pme1_enviado_em as em from mentoria_inscricoes where id = ${i}`;
    expect(x!.em).not.toBeNull();
    const hist = await owner<{ tipo: string; campos: string[] }[]>`
      select tipo, campos from mentoria_historico where inscricao_id = ${i}`;
    expect(hist).toContainEqual({ tipo: 'pme.enviado', campos: ['pme_1'] });
  });

  it('2º PME sem encerramento no catálogo ganha o padrão; envio com ciclo aberto marca não concluído', async () => {
    const i = await inscricao();
    const s = await operacao();
    await enviarOk(s, i, { enviadoEm: dia(5) });
    const c2 = await enviarOk(s, i);
    expect(c2.numero).toBe(2);
    expect(encerramento(c2).descricao).toBe('Encerramento do 2º PME');
    const [atual, antigo] = (await ficha(s, i)).ciclos;
    expect(atual!.status).toBe('EM_ANDAMENTO');
    expect(antigo).toMatchObject({ numero: 1, status: 'NAO_CONCLUIDO', naoConcluidoEm: HOJE });
  });

  it('recusa sem PME ativo no catálogo, fora de ATIVO, depois do término e com data futura', async () => {
    const s = await operacao();
    await owner`update mentoria_pmes set ativo = false where numero = 1`;
    const i = await inscricao();
    const semCatalogo = await enviar(s, i);
    expect(semCatalogo.status).toBe(400);
    expect(semCatalogo.body.message).toBe('Cadastre o 1º PME em Configurações');
    await owner`update mentoria_pmes set ativo = true where numero = 1`;
    const onb = await enviar(s, await inscricao({ status: 'ONBOARDING' }));
    expect(onb.body.message).toBe('Só mentorado ativo recebe PME');
    const fim = await enviar(s, await inscricao({ termino: dia(1) }));
    expect(fim.body.message).toBe('A jornada já terminou');
    const futuro = await enviar(s, i, { enviadoEm: dia(-1) });
    expect(futuro.body.message).toBe('A data de envio não pode ser no futuro');
  });

  it('Especialista e Mentor não enviam', async () => {
    const i = await inscricao();
    expect((await enviar(await manu(), i)).status).toBe(404);
    expect((await enviar(await comoPerfil('MENTOR'), i)).status).toBe(404);
  });

  it('marcar o 1º PME enviado na Fila também abre o ciclo 1', async () => {
    const i = await inscricao();
    const s = await operacao();
    const r = await h.put(`/api/mentoria/inscricoes/${i}/pme1-enviado`, { enviado: true }, s);
    expect(r.status, r.text).toBe(200);
    const f = await ficha(s, i);
    expect(f.ciclos.map((c) => c.numero)).toEqual([1]);
    expect(f.pode).toMatchObject({ pme: true, tarefa: false });
  });
});

describe('status e datas do ciclo', () => {
  it('9 dias de atraso em andamento; 10 e 16 segunda chance; 17 não concluído', async () => {
    const i = await inscricao();
    const s = await operacao();
    let c = await enviarOk(s, i, { enviadoEm: dia(39) });
    expect([c.status, c.diasAtraso]).toEqual(['EM_ANDAMENTO', 9]);
    for (const [envio, status, atraso] of [
      [40, 'SEGUNDA_CHANCE', 10],
      [46, 'SEGUNDA_CHANCE', 16],
      [47, 'NAO_CONCLUIDO', 17],
    ] as const) {
      const r = await h.patch(
        `/api/mentoria/ciclos/${c.id}`,
        { version: c.version, enviadoEm: dia(envio) },
        s,
      );
      expect(r.status, r.text).toBe(200);
      c = r.body as CicloDTO;
      expect([c.status, c.diasAtraso]).toEqual([status, atraso]);
    }
  });

  it('corrigir o envio move o prazo das tarefas do ciclo', async () => {
    const i = await inscricao();
    const s = await operacao();
    const c = await enviarOk(s, i, { enviadoEm: dia(2) });
    const r = await h.patch(
      `/api/mentoria/ciclos/${c.id}`,
      { version: c.version, enviadoEm: dia(4) },
      s,
    );
    const novo = r.body as CicloDTO;
    expect(novo.prazo).toBe(dia(-26));
    expect(novo.tarefas.every((t) => t.prazo === dia(-26))).toBe(true);
  });

  it('encerramento feito fecha o ciclo e desfazer reabre', async () => {
    const i = await inscricao();
    const c = await enviarOk(await operacao(), i);
    const s = await duda();
    const enc = encerramento(c);
    const r = await marcar(s, enc, { status: 'FEITA' });
    expect(r.status, r.text).toBe(200);
    let [atual] = (await ficha(s, i)).ciclos;
    expect(atual!.status).toBe('CONCLUIDO');
    expect(encerramento(atual!).cobradaPor).toBeTruthy();
    await marcar(s, { id: enc.id, version: r.body.version }, { status: 'PENDENTE' });
    [atual] = (await ficha(s, i)).ciclos;
    expect([atual!.status, atual!.concluidoEm]).toEqual(['EM_ANDAMENTO', null]);
  });

  it('não reabre o encerramento depois do PME seguinte', async () => {
    const i = await inscricao();
    const s = await duda();
    const c = await enviarOk(s, i);
    const r = await marcar(s, encerramento(c), { status: 'FEITA' });
    await enviarOk(s, i);
    const volta = await marcar(
      s,
      { id: encerramento(c).id, version: r.body.version },
      { status: 'PENDENTE' },
    );
    expect(volta.status).toBe(400);
    expect(volta.body.message).toBe('O PME seguinte já foi enviado');
  });

  it('ciclo anterior ao sistema: sem tarefas, fecha à mão pelo Acompanhamento', async () => {
    const i = await inscricao({ importada: true });
    const op = await operacao();
    const r = await h.post(
      `/api/mentoria/inscricoes/${i}/ciclos/anterior`,
      { numero: 5, enviadoEm: dia(10) },
      op,
    );
    expect(r.status, r.text).toBe(201);
    const c = r.body as CicloDTO;
    expect(c).toMatchObject({ numero: 5, anteriorAoSistema: true, tarefas: [] });
    const menor = await h.post(
      `/api/mentoria/inscricoes/${i}/ciclos/anterior`,
      { numero: 4, enviadoEm: dia(5) },
      op,
    );
    expect(menor.status).toBe(400);
    const fechaOp = await h.patch(
      `/api/mentoria/ciclos/${c.id}`,
      { version: c.version, concluidoEm: HOJE },
      op,
    );
    expect(fechaOp.status).toBe(404);
    const s = await duda();
    const fecha = await h.patch(
      `/api/mentoria/ciclos/${c.id}`,
      { version: c.version, concluidoEm: HOJE },
      s,
    );
    expect(fecha.status, fecha.text).toBe(200);
    expect((fecha.body as CicloDTO).status).toBe('CONCLUIDO');
    // O 6º não está no catálogo.
    const seguinte = await enviar(s, i);
    expect(seguinte.body.message).toBe('Cadastre o 6º PME em Configurações');
  });
});

describe('tarefas do ciclo', () => {
  it('motivo só em parcial ou não feita; feita apaga o motivo; versão velha dá 409', async () => {
    const i = await inscricao();
    const c = await enviarOk(await operacao(), i);
    const s = await duda();
    const t = c.tarefas[0]!;
    expect((await marcar(s, t, { status: 'FEITA', motivo: 'x' })).status).toBe(400);
    const r = await marcar(s, t, { status: 'NAO_FEITA', motivo: 'Viajou' });
    expect((await tarefa(s, t.id)).motivo).toBe('Viajou');
    expect((await marcar(s, t, { status: 'FEITA' })).status).toBe(409);
    await marcar(s, { id: t.id, version: r.body.version }, { status: 'FEITA' });
    const feita = await tarefa(s, t.id);
    expect([feita.status, feita.motivo]).toEqual(['FEITA', null]);
  });

  it('Operação não marca; Especialista não vê as tarefas do ciclo', async () => {
    const i = await inscricao();
    const op = await operacao();
    const c = await enviarOk(op, i);
    expect((await marcar(op, c.tarefas[0]!, { status: 'FEITA' })).status).toBe(404);
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${i}, 'POSICIONAMENTO', ${ids.carla!}, now())`;
    const s = await manu();
    const f = await ficha(s, i);
    expect(f.ciclos[0]!.tarefas).toEqual([]);
    expect(f.pode).toMatchObject({ pme: false, tarefa: false });
    expect((await marcar(s, c.tarefas[0]!, { status: 'FEITA' })).status).toBe(404);
  });

  it('comprovante: foto, vídeo ou PDF de quem marca a tarefa', async () => {
    const i = await inscricao();
    const c = await enviarOk(await operacao(), i);
    const pdf = Buffer.from('%PDF-1.4\n%fictício\n');
    const subir = (s: string) =>
      request(app.getHttpServer())
        .post(`/api/mentoria/tarefa-comprovante/${c.tarefas[0]!.id}/midia`)
        .set('Origin', ORIGIN)
        .set('Cookie', s)
        .attach('arquivo', pdf, { filename: 'c.pdf', contentType: 'application/pdf' });
    expect((await subir(await operacao())).status).toBe(404);
    const s = await duda();
    const r = await subir(s);
    expect(r.status, r.text).toBe(201);
    expect(r.body.tipo).toBe('PDF');
    const t = await tarefa(s, c.tarefas[0]!.id);
    expect([t.comprovanteMidiaId, t.comprovanteTipo]).toEqual([r.body.id, 'PDF']);
  });

  it('anonimizar apaga descrição e motivo das tarefas', async () => {
    const i = await inscricao();
    const c = await enviarOk(await operacao(), i);
    const s = await diretor();
    expect((await h.post(`/api/mentoria/inscricoes/${i}/anonimizar`, {}, s)).status).toBeLessThan(
      300,
    );
    const t = await tarefa(s, c.tarefas[0]!.id);
    expect(t.descricao).toBeNull();
  });
});
