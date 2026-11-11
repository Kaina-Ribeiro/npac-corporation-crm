import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, ORIGIN, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carlaId: string;

const http = (metodo: 'put' | 'patch', path: string, body: object, cookie: string) =>
  request(app.getHttpServer())[metodo](path).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${carlaId}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${carlaId}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};
const operacao = () => comoPerfil('OPERACAO');

type Etapa = {
  id: string;
  etapa: string;
  status: string;
  version: number;
  enviadaEm: string | null;
  concluidaEm: string | null;
};
type Ficha = {
  id: string;
  status: string;
  inicioJornada: string | null;
  terminoPrevisto: string | null;
  onboarding: Etapa[];
  caixa: { version: number; status: string; rastreio: string | null } | null;
};

const RDV = { tipo: 'INDIVIDUAL', mentoria: 'RDV', pessoas: [{ nome: 'Mentorado Fictício 01' }] };
const M2 = { tipo: 'INDIVIDUAL', mentoria: '2M', pessoas: [{ nome: 'Mentorado Fictício 02' }] };

const criar = async (cookie: string, corpo: object = RDV): Promise<Ficha> => {
  const r = await h.post('/api/mentoria/inscricoes', corpo, cookie);
  expect(r.status, r.text).toBe(201);
  return r.body as Ficha;
};
const abrir = async (cookie: string, id: string): Promise<Ficha> => {
  const r = await h.get(`/api/mentoria/inscricoes/${id}`, cookie);
  expect(r.status, r.text).toBe(200);
  return r.body as Ficha;
};
const etapa = (f: Ficha, nome: string) => f.onboarding.find((e) => e.etapa === nome)!;

/** PATCH na etapa pela version atual, relida da ficha. */
const mudar = async (cookie: string, id: string, nome: string, corpo: object) => {
  const e = etapa(await abrir(cookie, id), nome);
  return http(
    'patch',
    `/api/mentoria/onboarding/${e.id}`,
    { version: e.version, ...corpo },
    cookie,
  );
};
const dispensar = async (cookie: string, id: string, nome: string) => {
  const e = etapa(await abrir(cookie, id), nome);
  return h.post(`/api/mentoria/onboarding/${e.id}/dispensar`, { version: e.version }, cookie);
};
const concluir = async (cookie: string, id: string, nome: string) => {
  expect((await mudar(cookie, id, nome, { status: 'ENVIADA' })).status).toBe(200);
  expect((await mudar(cookie, id, nome, { status: 'CONCLUIDA' })).status).toBe(200);
};
const preencherFormulario = async (cookie: string, id: string) => {
  const r = await mudar(cookie, id, 'BOAS_VINDAS', { formularioPreenchido: true });
  expect(r.status, r.text).toBe(200);
};
const caixa = async (cookie: string, id: string, corpo: object) => {
  const f = await abrir(cookie, id);
  return http(
    'put',
    `/api/mentoria/inscricoes/${id}/caixa`,
    { version: f.caixa?.version ?? 0, ...corpo },
    cookie,
  );
};
const hojeBrasilia = async () => {
  const [r] = await owner<{ d: string }[]>`
    select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d`;
  return r!.d;
};

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

describe('etapas', () => {
  it('cadastro cria as 6 etapas PENDENTE, em qualquer mentoria', async () => {
    const s = await operacao();
    for (const corpo of [RDV, M2]) {
      const f = await criar(s, corpo);
      expect(f.onboarding.map((e) => e.etapa)).toEqual([
        'BOAS_VINDAS',
        'GRUPOS',
        'AQUECIMENTO',
        'PME_AQUECIMENTO',
        'CAIXA',
        'IDR',
      ]);
      expect(new Set(f.onboarding.map((e) => e.status))).toEqual(new Set(['PENDENTE']));
    }
  });

  it('passo 2 recusa ENVIADA com o passo 1 aberto', async () => {
    const s = await operacao();
    const f = await criar(s);
    const r = await mudar(s, f.id, 'GRUPOS', { status: 'ENVIADA' });
    expect(r.status, r.text).toBe(400);
  });

  it('passo recusa CONCLUIDA antes de ser enviado', async () => {
    const s = await operacao();
    const f = await criar(s);
    const r = await mudar(s, f.id, 'BOAS_VINDAS', { status: 'CONCLUIDA' });
    expect(r.status, r.text).toBe(400);
  });

  it('enviar e concluir gravam as datas e o histórico, só com nomes de campos', async () => {
    const s = await operacao();
    const f = await criar(s);
    await concluir(s, f.id, 'BOAS_VINDAS');
    const e = etapa(await abrir(s, f.id), 'BOAS_VINDAS');
    expect(e.status).toBe('CONCLUIDA');
    expect(e.enviadaEm).not.toBeNull();
    expect(e.concluidaEm).not.toBeNull();
    const hist = await owner<{ tipo: string; campos: string[] }[]>`
      select tipo, campos from mentoria_historico
      where inscricao_id = ${f.id} and tipo like 'onboarding.%' order by id`;
    expect(hist.map((x) => x.tipo)).toEqual(['onboarding.enviada', 'onboarding.concluida']);
    expect(hist[0]!.campos).toEqual(['BOAS_VINDAS', 'status']);
  });

  it('campos da etapa são salvos; campo de outra etapa é recusado', async () => {
    const s = await operacao();
    const f = await criar(s);
    const ok = await mudar(s, f.id, 'GRUPOS', { grupoAvisos: true, grupoNacao: false });
    expect(ok.status, ok.text).toBe(200);
    const fora = await mudar(s, f.id, 'GRUPOS', { formularioPreenchido: true });
    expect(fora.status).toBe(400);
  });

  it('version velha dá 409 VERSION_CONFLICT', async () => {
    const s = await operacao();
    const f = await criar(s);
    const e = etapa(f, 'BOAS_VINDAS');
    const ok = await http(
      'patch',
      `/api/mentoria/onboarding/${e.id}`,
      { version: e.version, status: 'ENVIADA' },
      s,
    );
    expect(ok.status).toBe(200);
    const r = await http(
      'patch',
      `/api/mentoria/onboarding/${e.id}`,
      { version: e.version, status: 'CONCLUIDA' },
      s,
    );
    expect(r.status).toBe(409);
    expect((r.body as { code: string }).code).toBe('VERSION_CONFLICT');
  });

  it('PATCH direto em CAIXA e IDR é recusado, exceto dispensar', async () => {
    const s = await operacao();
    const f = await criar(s, M2);
    for (const nome of ['CAIXA', 'IDR']) {
      const r = await mudar(s, f.id, nome, { status: 'ENVIADA' });
      expect(r.status, r.text).toBe(400);
      expect((await dispensar(s, f.id, nome)).status).toBe(200);
    }
    const depois = await abrir(s, f.id);
    expect(etapa(depois, 'CAIXA').status).toBe('DISPENSADA');
    expect(etapa(depois, 'IDR').status).toBe('DISPENSADA');
  });

  it('inscrição fora do onboarding não avança etapa', async () => {
    const s = await operacao();
    const f = await criar(s);
    await owner`update mentoria_inscricoes set status = 'CANCELADO' where id = ${f.id}`;
    const r = await mudar(s, f.id, 'BOAS_VINDAS', { status: 'ENVIADA' });
    expect(r.status, r.text).toBe(400);
  });

  it('o banco recusa o npac_app escrever status de CAIXA e IDR', async () => {
    const s = await operacao();
    const f = await criar(s);
    const e = etapa(f, 'CAIXA');
    await expect(
      owner.begin(async (t) => {
        await t`set local role npac_app`;
        await t`select set_config('app.user_id', ${carlaId}, true)`;
        await t`update mentoria_onboarding_etapas set status = 'CONCLUIDA' where id = ${e.id}`;
      }),
    ).rejects.toThrow();
  });
});

describe('caixa', () => {
  it('Caixa pode ser enviada com o formulário preenchido, com o PME de aquecimento aberto', async () => {
    const s = await operacao();
    const f = await criar(s);
    await preencherFormulario(s, f.id);
    const r = await caixa(s, f.id, { status: 'ENVIADO', enviadoEm: '2026-11-01', rastreio: 'AA1' });
    expect(r.status, r.text).toBe(200);
    expect(etapa(await abrir(s, f.id), 'PME_AQUECIMENTO').status).toBe('PENDENTE');
  });

  it('Caixa recusa envio sem formulário preenchido', async () => {
    const s = await operacao();
    const f = await criar(s);
    const r = await caixa(s, f.id, { status: 'ENVIADO', enviadoEm: '2026-11-01' });
    expect(r.status, r.text).toBe(400);
  });

  it('etapa CAIXA segue o envio: ENVIADO → ENVIADA, ENTREGUE → CONCLUIDA', async () => {
    const s = await operacao();
    const f = await criar(s);
    await preencherFormulario(s, f.id);
    expect((await caixa(s, f.id, { status: 'PREPARANDO' })).status).toBe(200);
    expect(etapa(await abrir(s, f.id), 'CAIXA').status).toBe('PENDENTE');

    expect((await caixa(s, f.id, { status: 'ENVIADO', enviadoEm: '2026-11-01' })).status).toBe(200);
    let e = etapa(await abrir(s, f.id), 'CAIXA');
    expect(e.status).toBe('ENVIADA');
    expect(e.enviadaEm).not.toBeNull();

    expect((await caixa(s, f.id, { status: 'ENTREGUE', entregueEm: '2026-11-05' })).status).toBe(
      200,
    );
    e = etapa(await abrir(s, f.id), 'CAIXA');
    expect(e.status).toBe('CONCLUIDA');
    expect(e.concluidaEm).not.toBeNull();
  });

  it('entrega anterior ao envio é recusada', async () => {
    const s = await operacao();
    const f = await criar(s);
    await preencherFormulario(s, f.id);
    await caixa(s, f.id, { status: 'ENVIADO', enviadoEm: '2026-11-05' });
    const r = await caixa(s, f.id, { status: 'ENTREGUE', entregueEm: '2026-11-01' });
    expect(r.status, r.text).toBe(400);
  });

  it('caixa com version velha dá 409', async () => {
    const s = await operacao();
    const f = await criar(s);
    await preencherFormulario(s, f.id);
    await caixa(s, f.id, { status: 'PREPARANDO' });
    const r = await http(
      'put',
      `/api/mentoria/inscricoes/${f.id}/caixa`,
      { version: 0, status: 'PREPARANDO' },
      s,
    );
    expect(r.status).toBe(409);
  });

  it('caixa dispensada recusa registro de envio', async () => {
    const s = await operacao();
    const f = await criar(s, M2);
    await dispensar(s, f.id, 'CAIXA');
    const r = await caixa(s, f.id, { status: 'PREPARANDO' });
    expect(r.status, r.text).toBe(400);
  });
});

describe('dispensar e fechar', () => {
  it('RDV recusa dispensar', async () => {
    const s = await operacao();
    const f = await criar(s);
    const r = await dispensar(s, f.id, 'BOAS_VINDAS');
    expect(r.status, r.text).toBe(400);
  });

  it('2M: dispensada libera a próxima', async () => {
    const s = await operacao();
    const f = await criar(s, M2);
    expect((await dispensar(s, f.id, 'BOAS_VINDAS')).status).toBe(200);
    const r = await mudar(s, f.id, 'GRUPOS', { status: 'ENVIADA' });
    expect(r.status, r.text).toBe(200);
    const hist = await owner<{ campos: string[] }[]>`
      select campos from mentoria_historico
      where inscricao_id = ${f.id} and tipo = 'onboarding.dispensada'`;
    expect(hist[0]!.campos).toEqual(['BOAS_VINDAS', 'status']);
  });

  it('2M: todas CONCLUIDA ou DISPENSADA vira ATIVO, com inicio_jornada = hoje', async () => {
    const s = await operacao();
    const f = await criar(s, M2);
    await concluir(s, f.id, 'BOAS_VINDAS');
    for (const nome of ['GRUPOS', 'AQUECIMENTO', 'PME_AQUECIMENTO', 'CAIXA']) {
      await dispensar(s, f.id, nome);
      expect((await abrir(s, f.id)).status).toBe('ONBOARDING');
    }
    await dispensar(s, f.id, 'IDR');
    const fechada = await abrir(s, f.id);
    const hoje = await hojeBrasilia();
    expect(fechada.status).toBe('ATIVO');
    expect(fechada.inicioJornada).toBe(hoje);
    const [t] = await owner<{ d: string }[]>`
      select to_char((${hoje}::date + interval '12 months')::date, 'YYYY-MM-DD') as d`;
    expect(fechada.terminoPrevisto).toBe(t!.d);
  });

  it('com etapa dispensada, a inscrição não volta a ser RDV', async () => {
    const s = await operacao();
    const f = await criar(s, M2);
    await dispensar(s, f.id, 'BOAS_VINDAS');
    const atual = (await h.get(`/api/mentoria/inscricoes/${f.id}`, s)).body as { version: number };
    const r = await http(
      'patch',
      `/api/mentoria/inscricoes/${f.id}`,
      { version: atual.version, mentoria: 'RDV' },
      s,
    );
    expect(r.status, r.text).toBe(400);
  });

  it('RDV com a Caixa entregue continua em onboarding até a IDR', async () => {
    const s = await operacao();
    const f = await criar(s);
    for (const nome of ['BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO', 'PME_AQUECIMENTO'])
      await concluir(s, f.id, nome);
    await preencherFormulario(s, f.id);
    await caixa(s, f.id, { status: 'ENVIADO', enviadoEm: '2026-11-01' });
    await caixa(s, f.id, { status: 'ENTREGUE', entregueEm: '2026-11-02' });
    const depois = await abrir(s, f.id);
    expect(depois.status).toBe('ONBOARDING');
    expect(depois.inicioJornada).toBeNull();
  });
});

describe('perfis e painel', () => {
  it('Manu recebe 404; Operação edita', async () => {
    const op = await operacao();
    const f = await criar(op);
    const e = etapa(f, 'BOAS_VINDAS');
    const manu = await comoPerfil('ESPECIALISTA');
    const corpo = { version: e.version, status: 'ENVIADA' };
    expect((await http('patch', `/api/mentoria/onboarding/${e.id}`, corpo, manu)).status).toBe(404);
    expect((await h.post(`/api/mentoria/onboarding/${e.id}/dispensar`, corpo, manu)).status).toBe(
      404,
    );
    expect((await h.post('/api/mentoria/onboarding/painel', {}, manu)).status).toBe(404);
    expect(
      (await http('put', `/api/mentoria/inscricoes/${f.id}/caixa`, { version: 0 }, manu)).status,
    ).toBe(404);
    const op2 = await operacao();
    expect((await http('patch', `/api/mentoria/onboarding/${e.id}`, corpo, op2)).status).toBe(200);
  });

  it('etapa inexistente dá 404', async () => {
    const s = await operacao();
    const r = await http(
      'patch',
      '/api/mentoria/onboarding/00000000-0000-4000-8000-00000000abcd',
      { version: 1, status: 'ENVIADA' },
      s,
    );
    expect(r.status).toBe(404);
  });

  type Painel = {
    total: number;
    funil: {
      etapa: string;
      total: number;
      alertas: number;
      pessoas: { inscricaoId: string; nome: string; dias: number; alerta: boolean }[];
    }[];
    caixasEmTransito: { inscricaoId: string; dias: number; alerta: boolean }[];
    idrsAAgendar: { inscricaoId: string }[];
  };

  it('painel mostra o funil, os dias parado, as caixas e as IDRs a agendar', async () => {
    const s = await operacao();
    const a = await criar(s);
    const b = await criar(s, {
      ...RDV,
      pessoas: [{ nome: 'Mentorado Fictício 03' }],
    });
    // A: boas-vindas enviada há 5 dias, parada.
    await mudar(s, a.id, 'BOAS_VINDAS', { status: 'ENVIADA' });
    await owner`update mentoria_onboarding_etapas set enviada_em = now() - interval '5 days'
      where inscricao_id = ${a.id} and etapa = 'BOAS_VINDAS'`;
    // B: mensagens concluídas, Caixa em trânsito há 25 dias.
    for (const nome of ['BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO', 'PME_AQUECIMENTO'])
      await concluir(s, b.id, nome);
    await preencherFormulario(s, b.id);
    const [d] = await owner<{ d: string }[]>`
      select to_char((now() at time zone 'America/Sao_Paulo')::date - 25, 'YYYY-MM-DD') as d`;
    await caixa(s, b.id, { status: 'ENVIADO', enviadoEm: d!.d, rastreio: 'AA2' });

    let r = await h.post('/api/mentoria/onboarding/painel', {}, s);
    expect(r.status, r.text).toBe(200);
    let p = r.body as Painel;
    expect(p.total).toBe(2);
    const boas = p.funil.find((x) => x.etapa === 'BOAS_VINDAS')!;
    expect(boas.total).toBe(1);
    expect(boas.alertas).toBe(1);
    expect(boas.pessoas[0]).toMatchObject({ inscricaoId: a.id, dias: 5, alerta: true });
    expect(p.caixasEmTransito[0]).toMatchObject({ inscricaoId: b.id, dias: 25, alerta: true });
    expect(p.idrsAAgendar).toHaveLength(0);

    await caixa(s, b.id, { status: 'ENTREGUE', entregueEm: d!.d });
    r = await h.post('/api/mentoria/onboarding/painel', {}, s);
    p = r.body as Painel;
    expect(p.caixasEmTransito).toHaveLength(0);
    expect(p.idrsAAgendar[0]).toMatchObject({ inscricaoId: b.id });
    expect(p.funil.find((x) => x.etapa === 'IDR')!.total).toBe(1);
  });

  it('Caixa em trânsito só alerta depois de 20 dias', async () => {
    const s = await operacao();
    const f = await criar(s);
    await preencherFormulario(s, f.id);
    const [d] = await owner<{ d: string }[]>`
      select to_char((now() at time zone 'America/Sao_Paulo')::date - 20, 'YYYY-MM-DD') as d`;
    await caixa(s, f.id, { status: 'ENVIADO', enviadoEm: d!.d });
    const p = (await h.post('/api/mentoria/onboarding/painel', {}, s)).body as Painel;
    expect(p.caixasEmTransito[0]).toMatchObject({ dias: 20, alerta: false });
  });

  it('PAUSADO e importado não entram no painel', async () => {
    const s = await operacao();
    const a = await criar(s);
    await owner`update mentoria_inscricoes set status = 'PAUSADO' where id = ${a.id}`;
    const p = (await h.post('/api/mentoria/onboarding/painel', {}, s)).body as Painel;
    expect(p.total).toBe(0);
  });
});
