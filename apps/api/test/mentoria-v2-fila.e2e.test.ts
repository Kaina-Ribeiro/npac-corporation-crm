import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENTORIA_CLOCK } from '../src/mentoria/relogio.js';
import {
  api,
  closeTestApp,
  createTestApp,
  owner,
  resetAuthState,
  type FakeClock,
} from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let relogio: FakeClock;
const ids: Record<string, string> = {};

const DIA = 86_400_000;
/** Quinta, 10/12/2026, 10h de Brasília. */
const AGORA = Date.parse('2026-12-10T10:00:00-03:00');
/** Instante `n` dias antes de AGORA. */
const antes = (n: number) => new Date(AGORA - n * DIA).toISOString();
/** Data de Brasília `n` dias antes de AGORA (negativo = depois). */
const dia = (n: number) => new Date(AGORA - n * DIA - 3 * 3_600_000).toISOString().slice(0, 10);

const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${ids.carla!}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};
const operacao = () => comoPerfil('OPERACAO');

/** Um usuário do comercial vira do módulo só neste teste (o `afterEach` devolve o cargo). */
const virar = async (username: string, perfil: string) => {
  await owner`update "user" set role = 'ACOMPANHAMENTO', can_prospect = false, can_close = false
    where id = ${ids[username]!}`;
  await owner`insert into mentoria_perfis (user_id, perfil) values (${ids[username]!}, ${perfil})`;
};

let n = 0;
const inscricao = async (
  opts: {
    mentoria?: string;
    status?: string;
    importada?: boolean;
    criadoEm?: string;
    inicio?: string;
  } = {},
) => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, importada, criado_em, inicio_jornada)
    values ('INDIVIDUAL', ${opts.mentoria ?? 'RDV'}, ${opts.status ?? 'ONBOARDING'},
      ${opts.importada ?? false}, ${opts.criadoEm ?? antes(0)}, ${opts.inicio ?? null})
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  const status = opts.importada ? 'ANTERIOR_AO_SISTEMA' : 'PENDENTE';
  await owner`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status)
    select ${i!.id}, e, ${status}
    from unnest(array['BOAS_VINDAS','GRUPOS','AQUECIMENTO','PME_AQUECIMENTO','CAIXA','IDR']) e`;
  return i!.id;
};

const etapa = (
  inscricaoId: string,
  nome: string,
  status: string,
  datas: { enviada?: string; concluida?: string } = {},
) => owner`update mentoria_onboarding_etapas set status = ${status},
    enviada_em = ${datas.enviada ?? null}, concluida_em = ${datas.concluida ?? null}
  where inscricao_id = ${inscricaoId} and etapa = ${nome}`;

const reuniao = async (
  inscricaoId: string,
  b: { tipo?: string; inicio: string; status?: string; conduzidaPor?: string },
) => {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status)
    values (${inscricaoId}, ${b.tipo ?? 'IDR'}, ${b.conduzidaPor ?? ids.diretor!}, ${b.inicio},
      ${b.status ?? 'AGENDADA'}) returning id`;
  return r!.id;
};

let modelo = 0;
const acao = async (
  inscricaoId: string,
  b: { prevista: string; limite?: string; perfil?: string; pessoa?: string; anterior?: boolean },
) => {
  modelo += 1;
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_acoes (inscricao_id, plano_modelo_id, mes, foco, acao, gatilho,
      dias_para_executar, data_prevista, data_limite, responsavel_perfil, responsavel_id,
      anterior_ao_sistema)
    select ${inscricaoId}, m.id, m.mes, m.foco, m.acao, m.gatilho, 0, ${b.prevista},
      ${b.limite ?? b.prevista}, ${b.perfil ?? 'OPERACAO'}, ${b.pessoa ?? null}, ${b.anterior ?? false}
    from mentoria_plano_modelo m where m.mentoria = 'RDV'
    order by m.mes, m.id offset ${modelo % 12} limit 1
    returning id`;
  return r!.id;
};

type Item = {
  chave: string;
  tipo: string;
  inscricaoId: string | null;
  referenciaId: string | null;
  responsavelId: string | null;
  atrasado: boolean;
  mentorado: { nome: string; pessoas: { nome: string }[] } | null;
  reuniao: { status: string } | null;
  acao: { mes: number } | null;
};
const fila = async (s: string, body: object = {}) => {
  const r = await h.post('/api/mentoria/fila', body, s);
  expect(r.status, r.text).toBe(200);
  return r.body.itens as Item[];
};
const doTipo = (itens: Item[], tipo: string, inscricaoId?: string) =>
  itens.filter((i) => i.tipo === tipo && (!inscricaoId || i.inscricaoId === inscricaoId));

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  relogio = app.get(MENTORIA_CLOCK);
  for (const u of ['carla', 'diretor', 'murilo', 'igor', 'sonia']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
});
afterAll(async () => {
  await owner`delete from mentoria_perfis`;
  await owner`truncate mentoria_inscricoes, mentoria_fila_feitos cascade`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes, mentoria_fila_feitos cascade`;
  await owner`delete from mentoria_perfis`;
  relogio.set(AGORA);
});
afterEach(async () => {
  await owner`delete from mentoria_perfis where user_id in (${ids.murilo!}, ${ids.igor!})`;
  await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false,
    active = true where id in (${ids.murilo!}, ${ids.igor!})`;
});

describe('onboarding', () => {
  it('inscrição nova gera BOAS_VINDAS; some ao enviar', async () => {
    const s = await operacao();
    const i = await inscricao();
    const [item] = doTipo(await fila(s), 'BOAS_VINDAS', i);
    expect(item).toMatchObject({ atrasado: false, responsavelId: null });
    expect(item!.mentorado!.nome).toBe(`Mentorado Fictício ${n}`);
    expect(item!.chave).toBe(`boas-vindas:${i}`);
    await etapa(i, 'BOAS_VINDAS', 'ENVIADA', { enviada: antes(0) });
    expect(doTipo(await fila(s), 'BOAS_VINDAS', i)).toHaveLength(0);
  });

  it('passo pendente há mais de 3 dias com o anterior concluído gera PASSO_DEVIDO', async () => {
    const s = await operacao();
    const devendo = await inscricao({ criadoEm: antes(10) });
    await etapa(devendo, 'BOAS_VINDAS', 'CONCLUIDA', { enviada: antes(8), concluida: antes(4) });
    const emDia = await inscricao({ criadoEm: antes(10) });
    await etapa(emDia, 'BOAS_VINDAS', 'CONCLUIDA', { enviada: antes(8), concluida: antes(3) });
    const itens = await fila(s);
    const [item] = doTipo(itens, 'PASSO_DEVIDO', devendo);
    expect(item).toMatchObject({ atrasado: true });
    expect(itens.find((x) => x.chave === item!.chave)).toBeTruthy();
    expect(doTipo(itens, 'PASSO_DEVIDO', emDia)).toHaveLength(0);
    expect(doTipo(itens, 'BOAS_VINDAS', devendo)).toHaveLength(0);
  });

  it('passo curto ENVIADO há 4 dias gera PARADO; há 3 dias, não', async () => {
    const s = await operacao();
    const parado = await inscricao({ criadoEm: antes(10) });
    await etapa(parado, 'BOAS_VINDAS', 'ENVIADA', { enviada: antes(4) });
    const recente = await inscricao({ criadoEm: antes(10) });
    await etapa(recente, 'BOAS_VINDAS', 'ENVIADA', { enviada: antes(3) });
    const itens = await fila(s);
    expect(doTipo(itens, 'PARADO', parado)).toHaveLength(1);
    expect(doTipo(itens, 'PARADO', recente)).toHaveLength(0);
  });

  it('PME de aquecimento não gera PARADO', async () => {
    const s = await operacao();
    const i = await inscricao({ criadoEm: antes(30) });
    for (const e of ['BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO'])
      await etapa(i, e, 'CONCLUIDA', { enviada: antes(1), concluida: antes(1) });
    await etapa(i, 'PME_AQUECIMENTO', 'ENVIADA', { enviada: antes(10) });
    const itens = (await fila(s)).filter((x) => x.inscricaoId === i);
    expect(itens.map((x) => x.tipo)).toEqual([]);
  });

  it('formulário sem Caixa gera ENVIAR_CAIXA; atrasado depois de 3 dias', async () => {
    const s = await operacao();
    const novo = await inscricao({ criadoEm: antes(10) });
    const velho = await inscricao({ criadoEm: antes(10) });
    for (const [i, d] of [
      [novo, 1],
      [velho, 4],
    ] as const) {
      await owner`update mentoria_onboarding_etapas set formulario_preenchido = true
        where inscricao_id = ${i} and etapa = 'BOAS_VINDAS'`;
      await owner`update mentoria_onboarding_etapas set formulario_preenchido_em = ${antes(d)}
        where inscricao_id = ${i} and etapa = 'BOAS_VINDAS'`;
    }
    const itens = await fila(s);
    expect(doTipo(itens, 'ENVIAR_CAIXA', novo)[0]).toMatchObject({ atrasado: false });
    expect(doTipo(itens, 'ENVIAR_CAIXA', velho)[0]).toMatchObject({ atrasado: true });
    await owner`update mentoria_onboarding_etapas set status = 'ENVIADA', enviada_em = ${antes(0)}
      where inscricao_id = ${novo} and etapa = 'CAIXA'`;
    expect(doTipo(await fila(s), 'ENVIAR_CAIXA', novo)).toHaveLength(0);
  });

  it('o gatilho guarda quando o formulário foi preenchido', async () => {
    const i = await inscricao();
    await owner`update mentoria_onboarding_etapas set formulario_preenchido = true
      where inscricao_id = ${i} and etapa = 'BOAS_VINDAS'`;
    const [r] = await owner<{ em: Date | null }[]>`select formulario_preenchido_em as em
      from mentoria_onboarding_etapas where inscricao_id = ${i} and etapa = 'BOAS_VINDAS'`;
    expect(r!.em).not.toBeNull();
    await owner`update mentoria_onboarding_etapas set formulario_preenchido = false
      where inscricao_id = ${i} and etapa = 'BOAS_VINDAS'`;
    const [d] = await owner<{ em: Date | null }[]>`select formulario_preenchido_em as em
      from mentoria_onboarding_etapas where inscricao_id = ${i} and etapa = 'BOAS_VINDAS'`;
    expect(d!.em).toBeNull();
  });

  it('Caixa enviada há 21 dias gera CAIXA_ATRASADA; há 20, não', async () => {
    const s = await operacao();
    const atrasada = await inscricao({ criadoEm: antes(40) });
    await etapa(atrasada, 'CAIXA', 'ENVIADA', { enviada: antes(21) });
    const noPrazo = await inscricao({ criadoEm: antes(40) });
    await etapa(noPrazo, 'CAIXA', 'ENVIADA', { enviada: antes(20) });
    const itens = await fila(s);
    expect(doTipo(itens, 'CAIXA_ATRASADA', atrasada)).toHaveLength(1);
    expect(doTipo(itens, 'CAIXA_ATRASADA', noPrazo)).toHaveLength(0);
  });

  it('Caixa ENTREGUE sem IDR aberta gera AGENDAR_IDR; volta depois de FALTOU', async () => {
    const s = await operacao();
    const i = await inscricao({ criadoEm: antes(40) });
    await etapa(i, 'CAIXA', 'CONCLUIDA', { enviada: antes(10), concluida: antes(1) });
    expect(doTipo(await fila(s), 'AGENDAR_IDR', i)).toHaveLength(1);
    const r = await reuniao(i, { inicio: new Date(AGORA + 2 * DIA).toISOString() });
    expect(doTipo(await fila(s), 'AGENDAR_IDR', i)).toHaveLength(0);
    await owner`update mentoria_reunioes set status = 'FALTOU' where id = ${r}`;
    expect(doTipo(await fila(s), 'AGENDAR_IDR', i)).toHaveLength(1);
  });
});

describe('IDR', () => {
  it('dia da IDR gera LEMBRETE_IDR e LINK_IDR; LINK_IDR sai com LINK_ENVIADO', async () => {
    const s = await operacao();
    const i = await inscricao({ status: 'ONBOARDING' });
    const r = await reuniao(i, { inicio: '2026-12-10T15:00:00-03:00' });
    const itens = await fila(s);
    expect(doTipo(itens, 'LEMBRETE_IDR', i)).toHaveLength(1);
    expect(doTipo(itens, 'LINK_IDR', i)).toHaveLength(1);
    expect(doTipo(itens, 'REUNIAO_HOJE', i)[0]!.reuniao).toMatchObject({ status: 'AGENDADA' });
    await owner`update mentoria_reunioes set status = 'LINK_ENVIADO' where id = ${r}`;
    const depois = await fila(s);
    expect(doTipo(depois, 'LINK_IDR', i)).toHaveLength(0);
    const lembrete = doTipo(depois, 'LEMBRETE_IDR', i)[0]!;
    const f = await h.post('/api/mentoria/fila/feito', { chave: lembrete.chave }, s);
    expect(f.status, f.text).toBe(204);
    expect(doTipo(await fila(s), 'LEMBRETE_IDR', i)).toHaveLength(0);
  });

  it('IDR do Leo: LINK_IDR vai só para a Operação', async () => {
    await virar('murilo', 'MENTOR');
    const i = await inscricao();
    await reuniao(i, { inicio: '2026-12-10T15:00:00-03:00', conduzidaPor: ids.murilo });
    const daDuda = await inscricao();
    await reuniao(daDuda, { inicio: '2026-12-10T16:00:00-03:00', conduzidaPor: ids.carla });
    const s = await comoPerfil('ACOMPANHAMENTO');
    expect(doTipo(await fila(s), 'LINK_IDR', i)).toHaveLength(0);
    const [daDudaItem] = doTipo(await fila(s), 'LINK_IDR', daDuda);
    expect(daDudaItem!.responsavelId).toBe(ids.carla);
    const op = await operacao();
    const [doLeo] = doTipo(await fila(op), 'LINK_IDR', i);
    expect(doLeo!.responsavelId).toBeNull();
    const leo = await h.signIn('murilo@npac.com.br');
    expect((await h.post('/api/mentoria/fila', {}, leo)).status).toBe(404);
  });

  it('ENVIAR_PME1 sai com pme1-enviado', async () => {
    const s = await operacao();
    const i = await inscricao({ status: 'ATIVO' });
    await reuniao(i, { inicio: antes(1), status: 'REALIZADA' });
    expect(doTipo(await fila(s), 'ENVIAR_PME1', i)).toHaveLength(1);
    const r = await h.put(`/api/mentoria/inscricoes/${i}/pme1-enviado`, { enviado: true }, s);
    expect(r.status, r.text).toBe(200);
    expect(r.body.pme1EnviadoEm).toBeTruthy();
    expect(doTipo(await fila(s), 'ENVIAR_PME1', i)).toHaveLength(0);
    const [hist] = await owner<{ campos: string[] }[]>`
      select campos from mentoria_historico where tipo = 'inscricao.pme1'`;
    expect(hist!.campos).toEqual(['pme1EnviadoEm']);
  });
});

describe('plano e calendário', () => {
  it('ação entra no dia; depois fica atrasada; anterior_ao_sistema nunca entra', async () => {
    const s = await operacao();
    const i = await inscricao({ status: 'ATIVO' });
    const amanha = await acao(i, { prevista: dia(-1) });
    const hoje = await acao(i, { prevista: dia(0) });
    const atrasada = await acao(i, { prevista: dia(5) });
    const antiga = await acao(i, { prevista: dia(40), anterior: true });
    const itens = doTipo(await fila(s), 'ACAO', i);
    const por = (id: string) => itens.find((x) => x.referenciaId === id);
    expect(por(amanha)).toBeUndefined();
    expect(por(hoje)).toMatchObject({ atrasado: false });
    expect(por(atrasada)).toMatchObject({ atrasado: true });
    expect(por(antiga)).toBeUndefined();
    expect(por(hoje)!.acao!.mes).toBeGreaterThan(0);
  });

  it('RDV no mês 10 sem foto gera FOTO_FAMILIA; 2M não', async () => {
    const s = await operacao();
    const rdv = await inscricao({ status: 'ATIVO', inicio: '2026-03-05' });
    const dois = await inscricao({ status: 'ATIVO', mentoria: '2M', inicio: '2026-03-05' });
    const mes9 = await inscricao({ status: 'ATIVO', inicio: '2026-03-15' });
    const itens = await fila(s);
    expect(doTipo(itens, 'FOTO_FAMILIA', rdv)).toHaveLength(1);
    expect(doTipo(itens, 'FOTO_FAMILIA', dois)).toHaveLength(0);
    expect(doTipo(itens, 'FOTO_FAMILIA', mes9)).toHaveLength(0);
  });

  it('dia 1º gera AGENDA_MES e REUNIOES_6M; saem por fila_feitos e voltam no mês seguinte', async () => {
    relogio.set(Date.parse('2026-12-01T09:00:00-03:00'));
    const s = await operacao();
    await inscricao({ status: 'ATIVO', mentoria: '6M', inicio: '2026-06-01' });
    const itens = await fila(s);
    const agenda = doTipo(itens, 'AGENDA_MES')[0]!;
    const seis = doTipo(itens, 'REUNIOES_6M')[0]!;
    expect(agenda.chave).toBe('agenda-mes:2026-12');
    expect(seis.chave).toBe('reunioes-6m:2026-12');
    for (const c of [agenda.chave, seis.chave])
      expect((await h.post('/api/mentoria/fila/feito', { chave: c }, s)).status).toBe(204);
    expect(doTipo(await fila(s), 'AGENDA_MES')).toHaveLength(0);
    relogio.set(Date.parse('2026-12-20T09:00:00-03:00'));
    expect(doTipo(await fila(s), 'AGENDA_MES')).toHaveLength(0);
    relogio.set(Date.parse('2027-01-01T09:00:00-03:00'));
    expect(doTipo(await fila(s), 'AGENDA_MES')[0]!.chave).toBe('agenda-mes:2027-01');
  });

  it('"hoje" muda à meia-noite de Brasília, não à de UTC', async () => {
    const s = await operacao();
    const i = await inscricao({ status: 'ATIVO' });
    const a = await acao(i, { prevista: '2026-12-11' });
    relogio.set(Date.parse('2026-12-11T02:30:00Z'));
    expect((await fila(s)).find((x) => x.referenciaId === a)).toBeUndefined();
    relogio.set(Date.parse('2026-12-11T03:00:00Z'));
    expect((await fila(s)).find((x) => x.referenciaId === a)).toBeTruthy();
  });
});

describe('quem vê', () => {
  it('reunião de hoje aparece para quem conduz e para a Operação, com o status', async () => {
    await virar('igor', 'ESPECIALISTA');
    const i = await inscricao({ status: 'ATIVO' });
    await reuniao(i, {
      tipo: 'POSICIONAMENTO',
      inicio: '2026-12-10T14:00:00-03:00',
      status: 'CONFIRMADA',
      conduzidaPor: ids.igor,
    });
    const manu = await h.signIn('igor@npac.com.br');
    const [dela] = doTipo(await fila(manu), 'REUNIAO_HOJE', i);
    expect(dela).toMatchObject({ responsavelId: ids.igor, reuniao: { status: 'CONFIRMADA' } });
    const op = await operacao();
    expect(doTipo(await fila(op), 'REUNIAO_HOJE', i)).toHaveLength(1);
  });

  it('Especialista não vê os itens da Operação nem de inscrição alheia', async () => {
    await virar('igor', 'ESPECIALISTA');
    const dela = await inscricao({ status: 'ATIVO' });
    await reuniao(dela, { tipo: 'POSICIONAMENTO', inicio: antes(30), conduzidaPor: ids.igor });
    await acao(dela, { prevista: dia(0), perfil: 'ESPECIALISTA' });
    const alheia = await inscricao();
    await acao(alheia, { prevista: dia(0), perfil: 'ESPECIALISTA' });
    const manu = await h.signIn('igor@npac.com.br');
    for (const escopo of ['MINHA', 'EQUIPE']) {
      const itens = await fila(manu, { escopo });
      expect(itens.map((x) => x.tipo)).toEqual(['ACAO']);
      expect(itens[0]!.inscricaoId).toBe(dela);
    }
  });

  it('PAUSADO e CANCELADO não aparecem', async () => {
    const s = await operacao();
    const pausado = await inscricao({ status: 'PAUSADO' });
    const cancelado = await inscricao({ status: 'CANCELADO' });
    await acao(pausado, { prevista: dia(0) });
    const itens = await fila(s);
    expect(itens.filter((x) => x.inscricaoId === pausado || x.inscricaoId === cancelado)).toEqual(
      [],
    );
  });

  it('importados não geram BOAS_VINDAS', async () => {
    const s = await operacao();
    const i = await inscricao({ importada: true, status: 'ATIVO' });
    await owner`update mentoria_onboarding_etapas set status = 'PENDENTE' where inscricao_id = ${i}`;
    expect(doTipo(await fila(s), 'BOAS_VINDAS', i)).toHaveLength(0);
  });

  it('responsável desativado: item cai no perfil', async () => {
    await virar('igor', 'ACOMPANHAMENTO');
    const i = await inscricao({ status: 'ATIVO' });
    const a = await acao(i, { prevista: dia(0), perfil: 'ACOMPANHAMENTO', pessoa: ids.igor });
    const s = await comoPerfil('ACOMPANHAMENTO');
    expect((await fila(s)).find((x) => x.referenciaId === a)).toBeUndefined();
    const equipe = (await fila(s, { escopo: 'EQUIPE' })).find((x) => x.referenciaId === a);
    expect(equipe!.responsavelId).toBe(ids.igor);
    await owner`update "user" set active = false where id = ${ids.igor!}`;
    const minha = (await fila(s)).find((x) => x.referenciaId === a);
    expect(minha!.responsavelId).toBeNull();
  });

  it('Diretoria sem perfil vê tudo, sem repetir item', async () => {
    await virar('igor', 'ESPECIALISTA');
    const i = await inscricao({ criadoEm: antes(1) });
    const ativo = await inscricao({ status: 'ATIVO' });
    await acao(ativo, { prevista: dia(0), perfil: 'ACOMPANHAMENTO' });
    await acao(ativo, { prevista: dia(0), perfil: 'ESPECIALISTA' });
    await reuniao(ativo, {
      tipo: 'POSICIONAMENTO',
      inicio: '2026-12-10T14:00:00-03:00',
      conduzidaPor: ids.igor,
    });
    const s = await h.signIn('diretor@npac.com.br');
    const r = await h.post('/api/mentoria/fila', {}, s);
    expect(r.body.escopo).toBe('EQUIPE');
    const itens = r.body.itens as Item[];
    expect(doTipo(itens, 'BOAS_VINDAS', i)).toHaveLength(1);
    expect(doTipo(itens, 'ACAO', ativo)).toHaveLength(2);
    expect(doTipo(itens, 'REUNIAO_HOJE', ativo)).toHaveLength(1);
    expect(new Set(itens.map((x) => x.chave)).size).toBe(itens.length);
  });

  it('feito: só item sem estado próprio que está na fila de quem pede', async () => {
    const s = await operacao();
    const i = await inscricao();
    const inventada = await h.post('/api/mentoria/fila/feito', { chave: 'agenda-mes:2020-01' }, s);
    expect(inventada.status).toBe(404);
    const comEstado = await h.post('/api/mentoria/fila/feito', { chave: `boas-vindas:${i}` }, s);
    expect(comEstado.status).toBe(404);
    const comNome = await h.post('/api/mentoria/fila/feito', { chave: 'Mentorado Fictício' }, s);
    expect(comNome.status).toBe(400);
    const manu = await comoPerfil('ESPECIALISTA');
    const alheio = await h.post('/api/mentoria/fila/feito', { chave: 'agenda-mes:2026-12' }, manu);
    expect(alheio.status).toBe(404);
  });
});

describe('mensagens-modelo', () => {
  it('todos que operam leem; só Admin escreve, com version', async () => {
    const op = await operacao();
    const lista = await h.get('/api/mentoria/mensagens', op);
    expect(lista.status, lista.text).toBe(200);
    const boas = (lista.body as { momento: string; version: number }[]).find(
      (m) => m.momento === 'BOAS_VINDAS',
    )!;
    const corpo = {
      momento: 'BOAS_VINDAS',
      version: boas.version,
      textoIndividual: 'Oi {nome}!',
      textoCasal: 'Oi {nomes}!',
    };
    expect((await h.put('/api/mentoria/mensagens', corpo, op)).status).toBe(404);
    const duda = await comoPerfil('ACOMPANHAMENTO', true);
    const ok = await h.put('/api/mentoria/mensagens', corpo, duda);
    expect(ok.status, ok.text).toBe(200);
    expect((await h.put('/api/mentoria/mensagens', corpo, duda)).status).toBe(409);
    const depois = await h.get('/api/mentoria/mensagens', op);
    expect(depois.body.find((m: { momento: string }) => m.momento === 'BOAS_VINDAS')).toMatchObject(
      { textoIndividual: 'Oi {nome}!', textoCasal: 'Oi {nomes}!' },
    );
    await owner`update mentoria_mensagens_modelo set texto_individual = '', texto_casal = ''`;
  });
});
