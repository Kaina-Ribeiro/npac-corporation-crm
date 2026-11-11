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
const duda = () => comoPerfil('ACOMPANHAMENTO', true);
const operacao = () => comoPerfil('OPERACAO');

type Acao = {
  id: string;
  version: number;
  mes: number;
  status: string;
  itens: string[];
  itensFeitos: string[];
  dataPrevista: string;
  dataLimite: string;
  atrasada: boolean;
  anteriorAoSistema: boolean;
  podeEditar: boolean;
  feitaPor: string | null;
  foco: string;
};
type Ficha = {
  id: string;
  version: number;
  status: string;
  inicioJornada: string | null;
  terminoPrevisto: string | null;
  dataIdr: string | null;
  mesJornada: number | null;
  acoes: Acao[];
  onboarding: { id: string; etapa: string; version: number }[];
};

const abrir = async (cookie: string, id: string): Promise<Ficha> => {
  const r = await h.get(`/api/mentoria/inscricoes/${id}`, cookie);
  expect(r.status, r.text).toBe(200);
  return r.body as Ficha;
};

const hojeBrasilia = async () => {
  const [r] = await owner<{ d: string }[]>`
    select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d`;
  return r!.d;
};
const diasAtras = async (n: number) => {
  const [r] = await owner<{ d: string }[]>`
    select to_char((now() at time zone 'America/Sao_Paulo')::date - ${n}::int, 'YYYY-MM-DD') as d`;
  return r!.d;
};

/** Inscrição pronta, com plano gerado, sem passar pelas telas. */
const comPlano = async (
  mentoria: string,
  inicio: string,
  extra: { importada?: boolean; status?: string; idr?: boolean; nome?: string } = {},
) => {
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, data_idr,
      termino_previsto, importada)
    values ('INDIVIDUAL', ${mentoria}, ${extra.status ?? 'ATIVO'}, ${inicio},
      ${extra.idr === false ? null : inicio}, (${inicio}::date + interval '12 months')::date,
      ${extra.importada ?? false})
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${extra.nome ?? 'Mentorado Fictício 30'}, 'mentorado ficticio 30')`;
  await owner`select mentoria_gerar_acoes(${i!.id}::uuid, (now() at time zone 'America/Sao_Paulo')::date)`;
  return i!.id;
};

const patchAcao = (cookie: string, a: Acao, corpo: object) =>
  http('patch', `/api/mentoria/acoes/${a.id}`, { version: a.version, ...corpo }, cookie);

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

describe('início da jornada gera o plano', () => {
  it('2M: fechar o onboarding gera as ações', async () => {
    const s = await operacao();
    const r = await h.post(
      '/api/mentoria/inscricoes',
      { tipo: 'INDIVIDUAL', mentoria: '2M', pessoas: [{ nome: 'Mentorado Fictício 31' }] },
      s,
    );
    expect(r.status, r.text).toBe(201);
    const id = (r.body as Ficha).id;
    expect((await abrir(s, id)).acoes).toHaveLength(0);
    for (const nome of [
      'BOAS_VINDAS',
      'GRUPOS',
      'AQUECIMENTO',
      'PME_AQUECIMENTO',
      'CAIXA',
      'IDR',
    ]) {
      const e = (await abrir(s, id)).onboarding.find((x) => x.etapa === nome)!;
      const d = await h.post(
        `/api/mentoria/onboarding/${e.id}/dispensar`,
        { version: e.version },
        s,
      );
      expect(d.status, d.text).toBe(200);
    }
    const f = await abrir(s, id);
    expect(f.status).toBe('ATIVO');
    expect(f.inicioJornada).toBe(await hojeBrasilia());
    expect(f.acoes).toHaveLength(8);
    expect(f.acoes.every((a) => !a.anteriorAoSistema)).toBe(true);
  });

  it('importado 2M: datas passadas nascem anteriores; futuras, não', async () => {
    const s = await duda();
    const inicio = await diasAtras(100);
    const r = await h.post(
      '/api/mentoria/carteira/importar',
      {
        gerenciador: {
          dashboard: [{ nome: 'Fictício Importado', tipoMentoria: '2M', status: 'engajado' }],
        },
      },
      s,
    );
    expect(r.status, r.text).toBe(200);
    const [i] = await owner<{ id: string; inicio: string | null }[]>`
      select id, inicio_jornada as inicio from mentoria_inscricoes`;
    expect(i!.inicio).toBeNull();
    expect((await abrir(s, i!.id)).acoes).toHaveLength(0);
    const f = await abrir(s, i!.id);
    const p = await http(
      'patch',
      `/api/mentoria/inscricoes/${i!.id}`,
      { version: f.version, inicioJornada: inicio },
      s,
    );
    expect(p.status, p.text).toBe(200);
    const depois = await abrir(s, i!.id);
    expect(depois.acoes).toHaveLength(8);
    const hoje = await hojeBrasilia();
    for (const a of depois.acoes) expect(a.anteriorAoSistema).toBe(a.dataPrevista < hoje);
    expect(depois.acoes.some((a) => a.atrasada)).toBe(false);
  });

  it('importado RDV: informar a IDR gera as 12 ações', async () => {
    const s = await duda();
    const [i] = await owner<{ id: string }[]>`
      insert into mentoria_inscricoes (tipo, mentoria, status, importada)
      values ('INDIVIDUAL', 'RDV', 'ATIVO', true) returning id`;
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${i!.id}, 1, 'Mentorado Fictício 32', 'mentorado ficticio 32')`;
    const f = await abrir(s, i!.id);
    expect(f.acoes).toHaveLength(0);
    const data = await diasAtras(70);
    const r = await http(
      'put',
      `/api/mentoria/inscricoes/${i!.id}/data-idr`,
      { version: f.version, dataIdr: data },
      s,
    );
    expect(r.status, r.text).toBe(200);
    const d = await abrir(s, i!.id);
    expect(d.dataIdr).toBe(data);
    expect(d.inicioJornada).toBe(data);
    expect(d.terminoPrevisto).not.toBeNull();
    expect(d.acoes).toHaveLength(12);
    expect(d.acoes[0]!.anteriorAoSistema).toBe(true);
    expect(d.acoes[11]!.anteriorAoSistema).toBe(false);
  });

  it('RDV recusa mudar o início por PATCH', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    const f = await abrir(s, id);
    const r = await http(
      'patch',
      `/api/mentoria/inscricoes/${id}`,
      { version: f.version, inicioJornada: '2026-02-10' },
      s,
    );
    expect(r.status).toBe(400);
  });

  it('Operação não muda o início de um plano já começado', async () => {
    const id = await comPlano('2M', '2026-01-10', { idr: false });
    const s = await operacao();
    const f = await abrir(s, id);
    const r = await http(
      'patch',
      `/api/mentoria/inscricoes/${id}`,
      { version: f.version, inicioJornada: '2026-02-10' },
      s,
    );
    expect(r.status).toBe(400);
  });

  it('trocar a mentoria troca as pendentes e mantém as feitas', async () => {
    const s = await duda();
    const id = await comPlano('2M', '2026-01-10', { idr: false });
    const f = await abrir(s, id);
    const feita = f.acoes[0]!;
    expect((await patchAcao(s, feita, { status: 'FEITA' })).status).toBe(200);
    const atual = await abrir(s, id);
    const r = await http(
      'patch',
      `/api/mentoria/inscricoes/${id}`,
      { version: atual.version, mentoria: '6M' },
      s,
    );
    expect(r.status, r.text).toBe(200);
    const d = await abrir(s, id);
    expect(d.acoes.filter((a) => a.status === 'FEITA').map((a) => a.id)).toEqual([feita.id]);
    expect(d.acoes.filter((a) => a.status === 'PENDENTE')).toHaveLength(15);
  });
});

describe('corrigir a IDR', () => {
  it('recalcula só as pendentes e o término', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    const f = await abrir(s, id);
    const m1 = f.acoes.find((a) => a.mes === 1)!;
    expect((await patchAcao(s, m1, { status: 'FEITA' })).status).toBe(200);
    const atual = await abrir(s, id);
    const r = await http(
      'put',
      `/api/mentoria/inscricoes/${id}/data-idr`,
      { version: atual.version, dataIdr: '2026-01-20' },
      s,
    );
    expect(r.status, r.text).toBe(200);
    const d = await abrir(s, id);
    expect(d.terminoPrevisto).toBe('2027-01-20');
    expect(d.acoes.find((a) => a.mes === 1)!.dataPrevista).toBe('2026-01-10');
    expect(d.acoes.find((a) => a.mes === 3)!.dataPrevista).toBe('2026-03-20');
    expect(d.acoes.find((a) => a.mes === 7)!.dataLimite).toBe('2026-08-19');
    const hist = await h.get(`/api/mentoria/inscricoes/${id}/historico`, s);
    expect((hist.body as { itens: { tipo: string }[] }).itens.map((x) => x.tipo)).toContain(
      'idr.corrigida',
    );
  });

  it('mantém o término editado à mão', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    await owner`update mentoria_inscricoes set termino_previsto = '2027-06-30' where id = ${id}`;
    const f = await abrir(s, id);
    await http(
      'put',
      `/api/mentoria/inscricoes/${id}/data-idr`,
      { version: f.version, dataIdr: '2026-01-20' },
      s,
    );
    expect((await abrir(s, id)).terminoPrevisto).toBe('2027-06-30');
  });

  it('recusa data futura, IDR que não aconteceu e version velha', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    const f = await abrir(s, id);
    const url = `/api/mentoria/inscricoes/${id}/data-idr`;
    expect((await http('put', url, { version: f.version, dataIdr: '2099-01-01' }, s)).status).toBe(
      400,
    );
    expect((await http('put', url, { version: 99, dataIdr: '2026-01-20' }, s)).status).toBe(409);
    const n = await h.post(
      '/api/mentoria/inscricoes',
      { tipo: 'INDIVIDUAL', mentoria: 'RDV', pessoas: [{ nome: 'Mentorado Fictício 33' }] },
      s,
    );
    const b = n.body as Ficha;
    const r = await http(
      'put',
      `/api/mentoria/inscricoes/${b.id}/data-idr`,
      { version: b.version, dataIdr: '2026-01-20' },
      s,
    );
    expect(r.status).toBe(400);
  });

  it('Operação recebe 404', async () => {
    const id = await comPlano('RDV', '2026-01-10');
    const s = await operacao();
    const f = await abrir(s, id);
    const r = await http(
      'put',
      `/api/mentoria/inscricoes/${id}/data-idr`,
      { version: f.version, dataIdr: '2026-01-20' },
      s,
    );
    expect(r.status).toBe(404);
  });
});

describe('ações', () => {
  it('marcar todos os passos conclui; desmarcar reabre', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    let a = (await abrir(s, id)).acoes.find((x) => x.mes === 11)!;
    expect(a.itens).toEqual(['Foto recebida', 'Presente produzido', 'Enviado', 'Entregue']);
    let r = await patchAcao(s, a, { itensFeitos: ['Foto recebida'] });
    expect(r.status, r.text).toBe(200);
    expect((r.body as Acao).status).toBe('PENDENTE');
    a = (await abrir(s, id)).acoes.find((x) => x.mes === 11)!;
    r = await patchAcao(s, a, { itensFeitos: a.itens });
    expect((r.body as Acao).status).toBe('FEITA');
    a = (await abrir(s, id)).acoes.find((x) => x.mes === 11)!;
    expect(a.feitaPor).toBeTruthy();
    r = await patchAcao(s, a, { itensFeitos: a.itens.slice(1) });
    expect((r.body as Acao).status).toBe('PENDENTE');
    a = (await abrir(s, id)).acoes.find((x) => x.mes === 11)!;
    expect(a.feitaPor).toBeNull();
  });

  it('passo que não é da ação é ignorado', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    const a = (await abrir(s, id)).acoes.find((x) => x.mes === 9)!;
    const r = await patchAcao(s, a, { itensFeitos: ['Outro passo'] });
    expect(r.status).toBe(200);
    const d = (await abrir(s, id)).acoes.find((x) => x.mes === 9)!;
    expect(d.itensFeitos).toEqual([]);
    expect(d.status).toBe('PENDENTE');
  });

  it('marcar feita à mão e reabrir', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    let a = (await abrir(s, id)).acoes[0]!;
    expect((await patchAcao(s, a, { status: 'FEITA' })).status).toBe(200);
    a = (await abrir(s, id)).acoes[0]!;
    expect(a.status).toBe('FEITA');
    expect(a.atrasada).toBe(false);
    expect((await patchAcao(s, a, { status: 'PENDENTE' })).status).toBe(200);
    expect((await abrir(s, id)).acoes[0]!.status).toBe('PENDENTE');
  });

  it('version velha dá 409', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    const a = (await abrir(s, id)).acoes[0]!;
    await patchAcao(s, a, { status: 'FEITA' });
    const r = await patchAcao(s, a, { status: 'PENDENTE' });
    expect(r.status).toBe(409);
  });

  it('observação cifrada, evidência por link', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    const a = (await abrir(s, id)).acoes[0]!;
    const r = await patchAcao(s, a, {
      observacao: 'Texto fictício',
      evidenciaLink: 'https://drive.google.com/fict',
    });
    expect(r.status, r.text).toBe(200);
    const [q] = await owner<{ observacao: string }[]>`
      select observacao from mentoria_acoes where id = ${a.id}`;
    expect(q!.observacao).not.toContain('fictício');
    const d = await h.get(`/api/mentoria/acoes/${a.id}`, s);
    expect(d.body).toMatchObject({
      observacao: 'Texto fictício',
      evidenciaLink: 'https://drive.google.com/fict',
    });
  });

  it('evidência fora de https é recusada', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    const a = (await abrir(s, id)).acoes[0]!;
    expect((await patchAcao(s, a, { evidenciaLink: 'http://x.test/a' })).status).toBe(400);
  });

  it('Operação marca só as do perfil; as outras dão 404', async () => {
    const id = await comPlano('RDV', '2026-01-10');
    const s = await operacao();
    const f = await abrir(s, id);
    const m9 = f.acoes.find((a) => a.mes === 9)!;
    const m2 = f.acoes.find((a) => a.mes === 2)!;
    expect(m9.podeEditar).toBe(true);
    expect(m2.podeEditar).toBe(false);
    expect((await patchAcao(s, m9, { status: 'FEITA' })).status).toBe(200);
    expect((await patchAcao(s, m2, { status: 'FEITA' })).status).toBe(404);
  });

  it('Mentor e sem perfil recebem 404', async () => {
    const id = await comPlano('RDV', '2026-01-10');
    const [a] = await owner<{ id: string }[]>`
      select id from mentoria_acoes where inscricao_id = ${id} limit 1`;
    for (const perfil of ['MENTOR', null]) {
      const s = await comoPerfil(perfil);
      expect((await h.get(`/api/mentoria/acoes/${a!.id}`, s)).status).toBe(404);
      expect((await h.post('/api/mentoria/plano/semana', {}, s)).status).toBe(404);
    }
  });

  it('FLEXIVEL só atrasa depois do fim do mês 7', async () => {
    const s = await duda();
    const dentro = await comPlano('RDV', await diasAtras(200));
    const fora = await comPlano('RDV', await diasAtras(300));
    await owner`update mentoria_acoes set data_prevista = (now() at time zone 'America/Sao_Paulo')::date - 10,
        data_limite = (now() at time zone 'America/Sao_Paulo')::date + 5
      where inscricao_id = ${dentro} and mes = 7`;
    await owner`update mentoria_acoes set data_prevista = (now() at time zone 'America/Sao_Paulo')::date - 40,
        data_limite = (now() at time zone 'America/Sao_Paulo')::date - 1
      where inscricao_id = ${fora} and mes = 7`;
    expect((await abrir(s, dentro)).acoes.find((a) => a.mes === 7)!.atrasada).toBe(false);
    expect((await abrir(s, fora)).acoes.find((a) => a.mes === 7)!.atrasada).toBe(true);
  });

  it('mês da jornada depois do 12º continua calculando', async () => {
    const s = await duda();
    const id = await comPlano('RDV', await diasAtras(400));
    expect((await abrir(s, id)).mesJornada).toBe(14);
  });
});

describe('visões', () => {
  it('semana traz o que vence, separa atrasadas e deixa de fora o resto', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10', { nome: 'Mentorado Fictício 34' });
    const [p] = await owner<{ inicio: string; fim: string }[]>`
      select to_char(date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date, 'YYYY-MM-DD') as inicio,
        to_char(date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date + 6, 'YYYY-MM-DD') as fim`;
    const hoje = await hojeBrasilia();
    const marca = (mes: number, d: string) =>
      owner`update mentoria_acoes set data_prevista = ${d}::date, data_limite = ${d}::date
        where inscricao_id = ${id} and mes = ${mes}`;
    await owner`update mentoria_acoes set data_prevista = '2030-01-01', data_limite = '2030-01-01'
      where inscricao_id = ${id}`;
    await marca(1, hoje);
    await marca(2, p!.fim);
    await marca(3, await diasAtras(30));
    await owner`update mentoria_acoes set status = 'FEITA', data_prevista = ${hoje}::date,
      data_limite = ${hoje}::date where inscricao_id = ${id} and mes = 4`;
    await owner`update mentoria_acoes set anterior_ao_sistema = true,
      data_prevista = ${hoje}::date, data_limite = ${hoje}::date
      where inscricao_id = ${id} and mes = 5`;
    const r = await h.post('/api/mentoria/plano/semana', {}, s);
    expect(r.status, r.text).toBe(200);
    const b = r.body as {
      inicio: string;
      fim: string;
      atrasadas: Acao[];
      atrasadasTotal: number;
      semana: Acao[];
    };
    expect(b.inicio).toBe(p!.inicio);
    expect(b.semana.map((a) => a.mes).sort()).toEqual([1, 2]);
    expect(b.atrasadas.map((a) => a.mes)).toEqual([3]);
    expect(b.atrasadasTotal).toBe(1);
  });

  it('lista filtra por mês e pagina', async () => {
    const s = await duda();
    for (let n = 0; n < 3; n++) await comPlano('6M', '2026-01-10', { idr: false });
    const r = await h.post('/api/mentoria/plano/lista', { mes: 7 }, s);
    expect(r.status, r.text).toBe(200);
    const b = r.body as { itens: Acao[]; total: number; cursor: string | null };
    expect(b.total).toBe(6);
    expect(b.itens.every((a) => a.mes === 7)).toBe(true);
    const tudo = await h.post('/api/mentoria/plano/lista', {}, s);
    const p1 = tudo.body as { itens: Acao[]; total: number; cursor: string };
    expect(p1.total).toBe(45);
    expect(p1.itens).toHaveLength(45);
  });

  it('cursor continua de onde parou', async () => {
    const s = await duda();
    for (let n = 0; n < 5; n++) await comPlano('6M', '2026-01-10', { idr: false });
    const p1 = (await h.post('/api/mentoria/plano/lista', {}, s)).body as {
      itens: Acao[];
      total: number;
      cursor: string;
    };
    expect(p1.total).toBe(75);
    expect(p1.itens).toHaveLength(50);
    const p2 = (await h.post('/api/mentoria/plano/lista', { cursor: p1.cursor }, s)).body as {
      itens: Acao[];
      cursor: string | null;
    };
    expect(p2.itens).toHaveLength(25);
    expect(p2.cursor).toBeNull();
    expect(new Set([...p1.itens, ...p2.itens].map((a) => a.id)).size).toBe(75);
  });

  it('lista de mentorados traz o resumo do plano', async () => {
    const s = await duda();
    await comPlano('RDV', '2026-01-10');
    const r = await h.post('/api/mentoria/inscricoes/lista', {}, s);
    const b = r.body as { itens: { plano: { total: number; feitas: number } }[] };
    expect(b.itens[0]!.plano).toMatchObject({ total: 12, feitas: 0 });
  });
});

describe('plano-modelo', () => {
  type Linha = {
    id: string;
    version: number;
    mentoria: string;
    mes: number;
    foco: string;
    ativo: boolean;
  };
  const modelo = async (s: string) => {
    const r = await h.get('/api/mentoria/plano-modelo', s);
    expect(r.status, r.text).toBe(200);
    return r.body as Linha[];
  };

  it('só Admin abre e edita; os demais recebem 404', async () => {
    for (const perfil of ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA']) {
      const s = await comoPerfil(perfil);
      expect((await h.get('/api/mentoria/plano-modelo', s)).status).toBe(404);
      expect((await http('put', '/api/mentoria/plano-modelo', {}, s)).status).toBe(404);
    }
  });

  it('o seed tem as linhas do PDF e da cadência', async () => {
    const m = await modelo(await duda());
    expect(m.filter((l) => l.mentoria === 'RDV')).toHaveLength(12);
    expect(m.filter((l) => l.mentoria === '2M')).toHaveLength(12);
    expect(m.filter((l) => l.mentoria === '6M')).toHaveLength(19);
  });

  it('editar não reescreve o que existe; vale para as próximas', async () => {
    const s = await duda();
    const id = await comPlano('RDV', '2026-01-10');
    const linha = (await modelo(s)).find((l) => l.mentoria === 'RDV' && l.mes === 3)!;
    const r = await http(
      'put',
      '/api/mentoria/plano-modelo',
      { id: linha.id, version: linha.version, foco: 'Foco fictício' },
      s,
    );
    try {
      expect(r.status, r.text).toBe(200);
      expect((await abrir(s, id)).acoes.find((a) => a.mes === 3)!.foco).toBe(linha.foco);
      const nova = await comPlano('RDV', '2026-02-10');
      expect((await abrir(s, nova)).acoes.find((a) => a.mes === 3)!.foco).toBe('Foco fictício');
    } finally {
      await owner`update mentoria_plano_modelo
        set foco = ${linha.foco}, version = ${linha.version} where id = ${linha.id}`;
    }
  });

  it('cria linha nova; version velha dá 409; id inexistente dá 404', async () => {
    const s = await duda();
    const r = await http(
      'put',
      '/api/mentoria/plano-modelo',
      {
        mentoria: '2M',
        mes: 3,
        foco: 'Foco fictício',
        acao: 'Ação fictícia',
        responsavelPerfil: 'OPERACAO',
      },
      s,
    );
    try {
      expect(r.status, r.text).toBe(200);
      const id = (r.body as Linha).id;
      expect(
        (await http('put', '/api/mentoria/plano-modelo', { id, version: 9, foco: 'X' }, s)).status,
      ).toBe(409);
      expect(
        (
          await http(
            'put',
            '/api/mentoria/plano-modelo',
            { id: '00000000-0000-4000-8000-00000000abcd', version: 1, foco: 'X' },
            s,
          )
        ).status,
      ).toBe(404);
    } finally {
      await owner`delete from mentoria_plano_modelo where foco = 'Foco fictício'`;
    }
  });
});
