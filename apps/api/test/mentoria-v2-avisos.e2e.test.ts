import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AVISO_PAYLOAD, AvisosScheduler } from '../src/mentoria/avisos.scheduler.js';
import { MENTORIA_CLOCK } from '../src/mentoria/relogio.js';
import { PUSH_SENDER } from '../src/push/push.service.js';
import {
  api,
  closeTestApp,
  createTestApp,
  owner,
  resetAuthState,
  type FakeClock,
  type MemoryPushSender,
} from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let relogio: FakeClock;
let push: MemoryPushSender;
let avisos: AvisosScheduler;
const ids: Record<string, string> = {};

const DIA = 86_400_000;
/** Quinta, 10/12/2026, 10h de Brasília. */
const AGORA = Date.parse('2026-12-10T10:00:00-03:00');
const antes = (n: number) => new Date(AGORA - n * DIA).toISOString();
const brasilia = (s: string) => Date.parse(`${s}-03:00`);

/** Um usuário do comercial vira do módulo só neste teste (o `afterEach` devolve o cargo). */
const virar = async (username: string, perfil: string) => {
  await owner`update "user" set role = 'ACOMPANHAMENTO', can_prospect = false, can_close = false
    where id = ${ids[username]!}`;
  await owner`insert into mentoria_perfis (user_id, perfil) values (${ids[username]!}, ${perfil})`;
};

/** Inscreve o aparelho pela rota de verdade (o cargo Acompanhamento passa a poder, D12). */
const aparelho = async (username: string) => {
  const s = await h.signIn(`${username}@npac.com.br`);
  const r = await h.post(
    '/api/push/subscriptions',
    { endpoint: `https://push.example/${username}`, keys: { p256dh: 'p', auth: 'a' } },
    s,
  );
  expect(r.status, r.text).toBe(200);
  return s;
};

let n = 0;
const inscricao = async (opts: { status?: string; importada?: boolean } = {}) => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, importada, criado_em)
    values ('INDIVIDUAL', 'RDV', ${opts.status ?? 'ONBOARDING'}, ${opts.importada ?? false},
      ${antes(30)}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  await owner`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status)
    select ${i!.id}, e, ${opts.importada ? 'ANTERIOR_AO_SISTEMA' : 'PENDENTE'}
    from unnest(array['BOAS_VINDAS','GRUPOS','AQUECIMENTO','PME_AQUECIMENTO','CAIXA','IDR']) e`;
  return i!.id;
};
const etapa = (i: string, nome: string, status: string, enviada: string) =>
  owner`update mentoria_onboarding_etapas set status = ${status}, enviada_em = ${enviada}
    where inscricao_id = ${i} and etapa = ${nome}`;

let modelo = 0;
const acao = async (
  i: string,
  b: { prevista: string; perfil?: string; pessoa?: string; anterior?: boolean },
) => {
  modelo += 1;
  await owner`
    insert into mentoria_acoes (inscricao_id, plano_modelo_id, mes, foco, acao, gatilho,
      dias_para_executar, data_prevista, data_limite, responsavel_perfil, responsavel_id,
      anterior_ao_sistema)
    select ${i}, m.id, m.mes, m.foco, m.acao, m.gatilho, 0, ${b.prevista}, ${b.prevista},
      ${b.perfil ?? 'OPERACAO'}, ${b.pessoa ?? null}, ${b.anterior ?? false}
    from mentoria_plano_modelo m where m.mentoria = 'RDV'
    order by m.mes, m.id offset ${modelo % 12} limit 1`;
};

const disparar = async () => {
  await avisos.fire();
  await avisos.settled();
};
/** Anda o relógio até o próximo aviso armado e espera o disparo. */
const ate = async (at: number) => {
  await avisos.settled();
  expect(avisos.armedAt).toBe(at);
  relogio.advanceTo(at);
  await avisos.settled();
};
const para = (username: string) =>
  push.sent.filter((x) => x.endpoint === `https://push.example/${username}`);

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  relogio = app.get(MENTORIA_CLOCK);
  push = app.get(PUSH_SENDER);
  avisos = app.get(AvisosScheduler);
  for (const u of ['carla', 'igor', 'murilo', 'ale']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
});
afterAll(async () => {
  await owner`delete from mentoria_perfis`;
  await owner`truncate mentoria_inscricoes, mentoria_fila_feitos, mentoria_avisos_enviados,
    push_subscriptions cascade`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes, mentoria_fila_feitos, mentoria_avisos_enviados,
    push_subscriptions cascade`;
  await owner`delete from mentoria_perfis`;
  await owner`insert into mentoria_perfis (user_id, perfil) values (${ids.carla!}, 'OPERACAO')`;
  await avisos.settled();
  relogio.reset();
  relogio.set(AGORA);
  push.sent = [];
  await aparelho('carla');
});
afterEach(async () => {
  await owner`delete from mentoria_perfis where user_id in (${ids.murilo!}, ${ids.igor!})`;
  await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false,
    active = true where id in (${ids.murilo!}, ${ids.igor!})`;
});

describe('avisos da Fila no celular', () => {
  it('etapa passa de 3 dias: um push para a Operação, uma vez só', async () => {
    const i = await inscricao();
    await etapa(i, 'BOAS_VINDAS', 'ENVIADA', antes(4));
    await disparar();
    expect(para('carla')).toHaveLength(1);
    await disparar();
    expect(para('carla')).toHaveLength(1);
  });

  it('Caixa no 21º dia: um push', async () => {
    const i = await inscricao();
    await etapa(i, 'CAIXA', 'ENVIADA', antes(20));
    await disparar();
    expect(push.sent).toHaveLength(0);
    await ate(brasilia('2026-12-11T08:00:00'));
    expect(para('carla')).toHaveLength(1);
  });

  it('ação no dia: push às 8h para o responsável', async () => {
    await virar('igor', 'ACOMPANHAMENTO');
    await aparelho('igor');
    const i = await inscricao({ status: 'ATIVO' });
    await acao(i, { prevista: '2026-12-11', perfil: 'ACOMPANHAMENTO', pessoa: ids.igor });
    await avisos.rearm();
    await ate(brasilia('2026-12-11T08:00:00'));
    expect(para('igor')).toHaveLength(1);
    expect(para('carla')).toHaveLength(0);
  });

  it('IDR: push às 8h e 30 minutos antes', async () => {
    const i = await inscricao();
    await owner`insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
      values (${i}, 'IDR', ${ids.carla!}, ${'2026-12-11T15:00:00-03:00'})`;
    await avisos.rearm();
    await ate(brasilia('2026-12-11T08:00:00'));
    expect(para('carla')).toHaveLength(1);
    await ate(brasilia('2026-12-11T14:30:00'));
    expect(para('carla')).toHaveLength(2);
  });

  it('dia 1º às 8h: push para a Operação', async () => {
    relogio.set(brasilia('2026-12-31T20:00:00'));
    await avisos.rearm();
    await ate(brasilia('2027-01-01T08:00:00'));
    expect(para('carla')).toHaveLength(1);
  });

  it('payload nunca contém nome', async () => {
    const i = await inscricao();
    await etapa(i, 'GRUPOS', 'ENVIADA', antes(5));
    await disparar();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.payload).toEqual(AVISO_PAYLOAD);
    expect(JSON.stringify(push.sent)).not.toMatch(/Fictício|ficticio/i);
  });

  it('API parada: ao subir, envia só uma vez', async () => {
    const a = await inscricao();
    await etapa(a, 'BOAS_VINDAS', 'ENVIADA', antes(9));
    const b = await inscricao();
    await etapa(b, 'CAIXA', 'ENVIADA', antes(40));
    const c = await inscricao({ status: 'ATIVO' });
    await acao(c, { prevista: '2026-12-10' });
    await disparar();
    expect(para('carla')).toHaveLength(1);
    await disparar();
    expect(para('carla')).toHaveLength(1);
    const [r] = await owner<
      { n: number }[]
    >`select count(*)::int as n from mentoria_avisos_enviados`;
    expect(r!.n).toBe(3);
  });

  it('aviso de um dia que já passou não acorda ninguém', async () => {
    const i = await inscricao({ status: 'ATIVO' });
    await acao(i, { prevista: '2026-12-08' });
    await disparar();
    expect(push.sent).toHaveLength(0);
  });

  it('PAUSADO não recebe push', async () => {
    const i = await inscricao({ status: 'PAUSADO' });
    await etapa(i, 'BOAS_VINDAS', 'ENVIADA', antes(9));
    await acao(i, { prevista: '2026-12-10' });
    await disparar();
    expect(push.sent).toHaveLength(0);
  });

  it('importação não dispara push', async () => {
    const i = await inscricao({ status: 'ATIVO', importada: true });
    for (const d of ['2026-06-01', '2026-09-01', '2026-12-01'])
      await acao(i, { prevista: d, anterior: true });
    await disparar();
    expect(push.sent).toHaveLength(0);
  });

  it('escrita do módulo rearma o despertador', async () => {
    const i = await inscricao();
    await avisos.rearm();
    const antesDe = avisos.armedAt;
    const s = await h.signIn('carla@npac.com.br');
    const r = await h.post(
      '/api/mentoria/reunioes',
      { inscricaoId: i, tipo: 'IDR', inicio: '2026-12-11T21:00', conduzidaPor: ids.carla },
      s,
    );
    expect(r.status, r.text).toBe(201);
    await avisos.settled();
    expect(avisos.armedAt).not.toBe(antesDe);
    // O lembrete das 8h do dia da IDR é o próximo aviso.
    expect(avisos.armedAt).toBe(brasilia('2026-12-11T08:00:00'));
  });

  it('cargo Acompanhamento se inscreve no push; SDR continua igual', async () => {
    const [carla] = await owner<{ n: number }[]>`
      select count(*)::int as n from push_subscriptions where user_id = ${ids.carla!}`;
    expect(carla!.n).toBe(1);
    await aparelho('ale');
    const s = await h.signIn('carla@npac.com.br');
    expect((await h.get('/api/push/key', s)).status).toBe(200);
    const fora = await h.post(
      '/api/push/subscriptions/remove',
      { endpoint: 'https://push.example/carla' },
      s,
    );
    expect(fora.status).toBe(200);
  });
});
