import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, ORIGIN, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carlaId: string;

const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${carlaId}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${carlaId}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};
const duda = () => comoPerfil('ACOMPANHAMENTO', true);

type Acao = {
  mes: number;
  status: string;
  dataPrevista: string;
  dataLimite: string;
  anteriorAoSistema: boolean;
  atrasada: boolean;
};
type Ficha = {
  id: string;
  version: number;
  status: string;
  terminoPrevisto: string | null;
  mesJornada: number | null;
  acoes: Acao[];
  pausa: { inicio: string; dias: number; motivo: string | null } | null;
  onboarding: { id: string; etapa: string; version: number }[];
};

const abrir = async (cookie: string, id: string): Promise<Ficha> => {
  const r = await h.get(`/api/mentoria/inscricoes/${id}`, cookie);
  expect(r.status, r.text).toBe(200);
  return r.body as Ficha;
};
const hoje = async (somar = 0) => {
  const [r] = await owner<{ d: string }[]>`
    select to_char((now() at time zone 'America/Sao_Paulo')::date + ${somar}::int, 'YYYY-MM-DD') as d`;
  return r!.d;
};

/** Plano com início `inicio`; datas de calendário calculadas no próprio banco. */
const comPlano = async (inicio: string, mentoria = 'RDV', status = 'ATIVO') => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr, termino_previsto)
    values ('INDIVIDUAL', ${mentoria}, ${status}, ${inicio}, ${inicio},
      (${inicio}::date + interval '12 months')::date) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, 'Mentorado Fictício 40', 'mentorado ficticio 40')`;
  await owner`select mentoria_gerar_acoes(${i!.id}::uuid, '2020-01-01'::date)`;
  return i!.id;
};
const pausar = (s: string, id: string, motivo?: string) =>
  h.post(`/api/mentoria/inscricoes/${id}/pausar`, motivo ? { motivo } : {}, s);
const retomar = (s: string, id: string) => h.post(`/api/mentoria/inscricoes/${id}/retomar`, {}, s);

/** Faz de conta que a pausa aberta começou há `dias` dias. */
const voltarPausa = async (id: string, dias: number) => {
  await owner`update mentoria_pausas
    set inicio = (now() at time zone 'America/Sao_Paulo')::date - ${dias}::int
    where inscricao_id = ${id} and fim is null`;
};
const marcaAcao = (id: string, mes: number, d: string) =>
  owner`update mentoria_acoes set data_prevista = ${d}::date, data_limite = ${d}::date
    where inscricao_id = ${id} and mes = ${mes}`;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const [c] = await owner<
    { id: string }[]
  >`select id from "user" where email = 'carla@npac.com.br'`;
  carlaId = c!.id;
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

describe('pausar e retomar', () => {
  it('pausa guarda o status anterior e retomar devolve', async () => {
    const s = await duda();
    for (const status of ['ATIVO', 'ONBOARDING']) {
      const id = await comPlano('2026-01-10', 'RDV', status);
      const r = await pausar(s, id, 'Motivo fictício');
      expect(r.status, r.text).toBe(200);
      const p = await abrir(s, id);
      expect(p.status).toBe('PAUSADO');
      expect(p.pausa).toMatchObject({ inicio: await hoje(), dias: 0, motivo: 'Motivo fictício' });
      expect((await retomar(s, id)).status).toBe(200);
      const d = await abrir(s, id);
      expect(d.status).toBe(status);
      expect(d.pausa).toBeNull();
    }
  });

  it('o motivo fica cifrado no banco', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    await pausar(s, id, 'Motivo fictício');
    const [p] = await owner<{ motivo: string }[]>`select motivo from mentoria_pausas`;
    expect(p!.motivo).not.toContain('fictício');
  });

  it('segunda pausa aberta é recusada', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    await pausar(s, id);
    const r = await pausar(s, id);
    expect(r.status).toBe(409);
    expect(r.text).toContain('já está pausada');
  });

  it('retomar sem pausa e pausar cancelada são recusados', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    expect((await retomar(s, id)).status).toBe(400);
    const c = await comPlano('2026-01-10', 'RDV', 'CANCELADO');
    expect((await pausar(s, c)).status).toBe(400);
  });

  it('PATCH de status não entra nem sai de PAUSADO', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    let f = await abrir(s, id);
    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch(`/api/mentoria/inscricoes/${id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', s)
        .send(body);
    expect((await patch({ version: f.version, status: 'PAUSADO' })).status).toBe(400);
    await pausar(s, id);
    f = await abrir(s, id);
    expect((await patch({ version: f.version, status: 'ATIVO' })).status).toBe(400);
  });

  it('retomar depois de 60 dias soma 60 ao término e às pendentes a partir do início da pausa', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    await marcaAcao(id, 8, await hoje(10));
    await marcaAcao(id, 9, await hoje(-30));
    await pausar(s, id);
    await voltarPausa(id, 60);
    const antes = await abrir(s, id);
    expect(antes.pausa!.dias).toBe(60);
    expect((await retomar(s, id)).status).toBe(200);
    const d = await abrir(s, id);
    expect(d.terminoPrevisto).toBe('2027-03-11');
    expect(d.acoes.find((a) => a.mes === 8)!.dataPrevista).toBe(await hoje(70));
    expect(d.acoes.find((a) => a.mes === 9)!.dataPrevista).toBe(await hoje(30));
  });

  it('ação feita ou já atrasada antes da pausa não muda', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    const antesDaPausa = await hoje(-90);
    await marcaAcao(id, 2, antesDaPausa);
    await marcaAcao(id, 3, await hoje(-10));
    await owner`update mentoria_acoes set status = 'FEITA'
      where inscricao_id = ${id} and mes = 3`;
    await pausar(s, id);
    await voltarPausa(id, 30);
    await retomar(s, id);
    const d = await abrir(s, id);
    expect(d.acoes.find((a) => a.mes === 2)!.dataPrevista).toBe(antesDaPausa);
    expect(d.acoes.find((a) => a.mes === 3)!.dataPrevista).toBe(await hoje(-10));
  });

  it('anterior_ao_sistema não muda', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    const futura = await hoje(5);
    await marcaAcao(id, 4, futura);
    await owner`update mentoria_acoes set anterior_ao_sistema = true
      where inscricao_id = ${id} and mes = 4`;
    await pausar(s, id);
    await voltarPausa(id, 15);
    await retomar(s, id);
    expect((await abrir(s, id)).acoes.find((a) => a.mes === 4)!.dataPrevista).toBe(futura);
  });

  it('FLEXIVEL em curso mantém a data e ganha prazo', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    const comeco = await hoje(-40);
    const limite = await hoje(-5);
    await owner`update mentoria_acoes set data_prevista = ${comeco}::date, data_limite = ${limite}::date
      where inscricao_id = ${id} and mes = 7`;
    await pausar(s, id);
    await voltarPausa(id, 20);
    await retomar(s, id);
    const a = (await abrir(s, id)).acoes.find((x) => x.mes === 7)!;
    expect(a.dataPrevista).toBe(comeco);
    expect(a.dataLimite).toBe(await hoje(15));
    expect(a.atrasada).toBe(false);
  });

  it('pausar e retomar no mesmo dia não muda datas', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    await marcaAcao(id, 8, await hoje());
    const antes = await abrir(s, id);
    await pausar(s, id);
    await retomar(s, id);
    const d = await abrir(s, id);
    expect(d.terminoPrevisto).toBe(antes.terminoPrevisto);
    expect(d.acoes.map((a) => a.dataPrevista)).toEqual(antes.acoes.map((a) => a.dataPrevista));
    expect(d.acoes.map((a) => a.dataLimite)).toEqual(antes.acoes.map((a) => a.dataLimite));
    expect(d.mesJornada).toBe(antes.mesJornada);
  });

  it('ação no dia exato do início da pausa é adiada', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    await marcaAcao(id, 8, await hoje(-7));
    await pausar(s, id);
    await voltarPausa(id, 7);
    await retomar(s, id);
    expect((await abrir(s, id)).acoes.find((a) => a.mes === 8)!.dataPrevista).toBe(await hoje());
  });

  it('duas pausas somam no mês da jornada e no término', async () => {
    const s = await duda();
    const inicio = await hoje(-125);
    const id = await comPlano(inicio);
    const base = await abrir(s, id);
    expect(base.mesJornada).toBeGreaterThanOrEqual(5);
    await pausar(s, id);
    await voltarPausa(id, 40);
    await retomar(s, id);
    // A segunda pausa, fechada no passado: 30 dias antes da primeira.
    await owner`insert into mentoria_pausas (inscricao_id, inicio, fim, status_anterior)
      values (${id}, (now() at time zone 'America/Sao_Paulo')::date - 110,
        (now() at time zone 'America/Sao_Paulo')::date - 80, 'ATIVO')`;
    const d = await abrir(s, id);
    // 125 dias menos 70 parados: ainda no 2º mês.
    expect(d.mesJornada).toBe(2);
  });

  it('corrigir a IDR depois de pausar mantém o prazo reposto', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    await owner`update mentoria_acoes set status = 'FEITA' where inscricao_id = ${id} and mes < 3`;
    await owner`insert into mentoria_pausas (inscricao_id, inicio, fim, status_anterior)
      values (${id}, '2026-02-15', '2026-02-25', 'ATIVO')`;
    await owner`update mentoria_inscricoes set termino_previsto = '2027-01-20' where id = ${id}`;
    const f = await abrir(s, id);
    const r = await request(app.getHttpServer())
      .put(`/api/mentoria/inscricoes/${id}/data-idr`)
      .set('Origin', ORIGIN)
      .set('Cookie', s)
      .send({ version: f.version, dataIdr: '2026-01-12' });
    expect(r.status, r.text).toBe(200);
    const d = await abrir(s, id);
    expect(d.terminoPrevisto).toBe('2027-01-22');
    expect(d.acoes.find((a) => a.mes === 3)!.dataPrevista).toBe('2026-03-22');
  });

  it('pausa depois do término: corrigir a IDR continua movendo o término', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    await owner`insert into mentoria_pausas (inscricao_id, inicio, fim, status_anterior)
      values (${id}, '2027-02-01', '2027-03-01', 'ATIVO')`;
    await owner`update mentoria_inscricoes set termino_previsto = '2027-02-07' where id = ${id}`;
    const f = await abrir(s, id);
    const r = await request(app.getHttpServer())
      .put(`/api/mentoria/inscricoes/${id}/data-idr`)
      .set('Origin', ORIGIN)
      .set('Cookie', s)
      .send({ version: f.version, dataIdr: '2026-01-12' });
    expect(r.status, r.text).toBe(200);
    expect((await abrir(s, id)).terminoPrevisto).toBe('2027-02-09');
  });

  it('pausa antes do início da jornada não empurra as datas', async () => {
    const s = await duda();
    const id = await comPlano('2026-03-01');
    await owner`insert into mentoria_pausas (inscricao_id, inicio, fim, status_anterior)
      values (${id}, '2026-01-10', '2026-02-10', 'ONBOARDING')`;
    const f = await abrir(s, id);
    await request(app.getHttpServer())
      .put(`/api/mentoria/inscricoes/${id}/data-idr`)
      .set('Origin', ORIGIN)
      .set('Cookie', s)
      .send({ version: f.version, dataIdr: '2026-03-02' });
    expect((await abrir(s, id)).acoes.find((a) => a.mes === 2)!.dataPrevista).toBe('2026-04-27');
  });

  it('pausado sai da semana e da lista geral, e continua na ficha', async () => {
    const s = await duda();
    const id = await comPlano('2026-01-10');
    await marcaAcao(id, 8, await hoje());
    await pausar(s, id);
    const b = (await h.post('/api/mentoria/plano/semana', {}, s)).body as {
      semana: Acao[];
      atrasadas: Acao[];
    };
    expect(b.semana).toHaveLength(0);
    expect(b.atrasadas).toHaveLength(0);
    const l = (await h.post('/api/mentoria/plano/lista', {}, s)).body as { total: number };
    expect(l.total).toBe(0);
    expect((await abrir(s, id)).acoes).toHaveLength(12);
  });

  it('dias parado do onboarding contam da última retomada', async () => {
    const s = await duda();
    const r = await h.post(
      '/api/mentoria/inscricoes',
      { tipo: 'INDIVIDUAL', mentoria: 'RDV', pessoas: [{ nome: 'Mentorado Fictício 41' }] },
      s,
    );
    const id = (r.body as Ficha).id;
    await owner`update mentoria_onboarding_etapas set status = 'ENVIADA',
        enviada_em = now() - interval '12 days'
      where inscricao_id = ${id} and etapa = 'BOAS_VINDAS'`;
    await owner`update mentoria_inscricoes set criado_em = now() - interval '12 days' where id = ${id}`;
    const dias = async () => {
      const p = (await h.post('/api/mentoria/onboarding/painel', {}, s)).body as {
        funil: { etapa: string; pessoas: { dias: number; alerta: boolean }[] }[];
      };
      return p.funil.find((c) => c.etapa === 'BOAS_VINDAS')!.pessoas[0]!;
    };
    expect((await dias()).dias).toBe(12);
    expect((await pausar(s, id)).status).toBe(200);
    await voltarPausa(id, 2);
    expect((await retomar(s, id)).status).toBe(200);
    const d = await dias();
    expect(d.dias).toBe(0);
    expect(d.alerta).toBe(false);
  });

  it('etapa pendente conta da retomada, se for mais recente que a anterior', async () => {
    const s = await duda();
    const r = await h.post(
      '/api/mentoria/inscricoes',
      { tipo: 'INDIVIDUAL', mentoria: 'RDV', pessoas: [{ nome: 'Mentorado Fictício 42' }] },
      s,
    );
    const id = (r.body as Ficha).id;
    await owner`update mentoria_onboarding_etapas set status = 'CONCLUIDA',
        enviada_em = now() - interval '12 days', concluida_em = now() - interval '10 days'
      where inscricao_id = ${id} and etapa = 'BOAS_VINDAS'`;
    await pausar(s, id);
    await voltarPausa(id, 2);
    await retomar(s, id);
    const p = (await h.post('/api/mentoria/onboarding/painel', {}, s)).body as {
      funil: { etapa: string; pessoas: { dias: number }[] }[];
    };
    expect(p.funil.find((c) => c.etapa === 'GRUPOS')!.pessoas[0]!.dias).toBe(0);
  });

  it('Operação recebe 404 ao pausar', async () => {
    const id = await comPlano('2026-01-10');
    const s = await comoPerfil('OPERACAO');
    expect((await pausar(s, id)).status).toBe(404);
    expect((await retomar(s, id)).status).toBe(404);
  });

  it('Acompanhamento sem selo pausa; Manu e Leo recebem 404', async () => {
    const id = await comPlano('2026-01-10');
    for (const perfil of ['ESPECIALISTA', 'MENTOR']) {
      const s = await comoPerfil(perfil);
      expect((await pausar(s, id)).status).toBe(404);
    }
    const s = await comoPerfil('ACOMPANHAMENTO');
    expect((await pausar(s, id)).status).toBe(200);
  });
});
