import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { CicloDTO, FilaDTO, FilaItemDTO, PmeCicloLinha } from '@npac/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AvisosScheduler } from '../src/mentoria/avisos.scheduler.js';
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

// Fase 2, Parte 4: Fila do dia com COBRANCA, SEMAFORO, ENVIAR_PME e PME_ATRASADO, a ação FIM_PME
// esperando o ciclo, o push desses itens, a aba 7 e o CSV (spec 2026-11-11, E17–E22, §6, §8).
// Relógio do módulo na terça 08/12/2026 ao meio-dia de Brasília; entrada no ar na quarta 18/11.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let relogio: FakeClock;
let push: MemoryPushSender;
let avisos: AvisosScheduler;
let desdeOriginal: string;
const ids: Record<string, string> = {};

const DESDE = '2026-11-18';
const em = (dia: string, hora = '12:00') => Date.parse(`${dia}T${hora}:00-03:00`);
const HOJE = em('2026-12-08');

/** A Carla com o perfil do teste; responde pelas inscrições criadas aqui. */
const carla = async (perfil = 'ACOMPANHAMENTO') => {
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  await owner`insert into mentoria_perfis (user_id, perfil) values (${ids.carla!}, ${perfil})`;
  return h.signIn('carla@npac.com.br');
};
/** O Igor vira do módulo só neste teste (o `afterEach` devolve o cargo). */
const igor = async (perfil: string) => {
  await owner`update "user" set role = 'ACOMPANHAMENTO', can_prospect = false, can_close = false
    where id = ${ids.igor!}`;
  await owner`delete from mentoria_perfis where user_id = ${ids.igor!}`;
  await owner`insert into mentoria_perfis (user_id, perfil) values (${ids.igor!}, ${perfil})`;
  return h.signIn('igor@npac.com.br');
};

let n = 0;
const inscricao = async (
  b: { status?: string; inicio?: string; termino?: string; responsavel?: string | null } = {},
) => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto,
      responsavel_id)
    values ('INDIVIDUAL', 'RDV', ${b.status ?? 'ATIVO'}, ${b.inicio ?? '2026-10-01'}::date,
      ${b.termino ?? '2027-10-01'}::date,
      ${b.responsavel === undefined ? ids.carla! : b.responsavel}) returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  return i!.id;
};
/** Check-ins respondidos nas semanas de 23/11 e 30/11: o semáforo fica verde. */
const emDia = (i: string) =>
  owner`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu, respondido_em)
    values (${i}, '2026-11-25T12:00:00-03:00', true, '2026-11-25T15:00:00-03:00'),
      (${i}, '2026-12-02T12:00:00-03:00', true, '2026-12-02T15:00:00-03:00')`;
const reuniao = async (i: string, conduz: string) => {
  const [r] = await owner<{ id: string }[]>`
    insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status)
    values (${i}, 'POSICIONAMENTO', ${conduz}, '2026-11-20T12:00:00Z', 'REALIZADA') returning id`;
  return r!.id;
};
const tarefa = async (i: string, prazo: string, conduz = ids.diretor!) => {
  const [t] = await owner<{ id: string; version: number }[]>`
    insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, descricao, prazo)
    values (${i}, 'REUNIAO', ${await reuniao(i, conduz)}, null, ${prazo}) returning id, version`;
  return t!;
};
const ciclo = async (
  i: string,
  b: { numero?: number; enviado: string; concluido?: string; segunda?: string },
) => {
  const [c] = await owner<{ id: string }[]>`
    insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em,
      segunda_chance_ate)
    values (${i}, ${b.numero ?? 1}, ${b.enviado}, ${b.concluido ?? null}, ${b.segunda ?? null})
    returning id`;
  return c!.id;
};
const fila = async (s: string, escopo: 'MINHA' | 'EQUIPE' = 'EQUIPE') => {
  const r = await h.post('/api/mentoria/fila', { escopo }, s);
  expect(r.status, r.text).toBe(200);
  return (r.body as FilaDTO).itens;
};
const doTipo = async (s: string, tipo: string, escopo: 'MINHA' | 'EQUIPE' = 'EQUIPE') =>
  (await fila(s, escopo)).filter((x) => x.tipo === tipo);
const aparelho = async (username: string) => {
  const s = await h.signIn(`${username}@npac.com.br`);
  const r = await h.post(
    '/api/push/subscriptions',
    { endpoint: `https://push.example/${username}`, keys: { p256dh: 'p', auth: 'a' } },
    s,
  );
  expect(r.status, r.text).toBe(200);
};
/** Põe o relógio no instante e dispara o despertador (o que venceu sai uma vez). */
const disparar = async (at: number) => {
  await avisos.settled();
  relogio.set(at);
  await avisos.fire();
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
  for (const u of ['carla', 'diretor', 'igor']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
  const [d] = await owner<{ desde: string }[]>`
    select to_char(desde, 'YYYY-MM-DD') as desde from mentoria_semaforo_inicio`;
  desdeOriginal = d!.desde;
});
afterAll(async () => {
  await owner`update mentoria_semaforo_inicio set desde = ${desdeOriginal}`;
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
  await owner`update mentoria_semaforo_inicio set desde = ${DESDE}`;
  await avisos.settled();
  relogio.reset();
  relogio.set(HOJE);
  push.sent = [];
});
afterEach(async () => {
  await owner`delete from mentoria_perfis where user_id = ${ids.igor!}`;
  await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false,
    active = true where id = ${ids.igor!}`;
});

describe('COBRANCA (E17)', () => {
  it('tarefa pendente entra no dia do prazo, atrasa depois e sai com o resultado', async () => {
    const i = await inscricao();
    await emDia(i);
    const hoje = await tarefa(i, '2026-12-08');
    const vencida = await tarefa(i, '2026-12-05');
    await tarefa(i, '2026-12-09');
    const s = await carla();
    const itens = await doTipo(s, 'COBRANCA', 'MINHA');
    expect(itens.map((x) => [x.referenciaId, x.atrasado])).toEqual([
      [vencida.id, true],
      [hoje.id, false],
    ]);
    expect(itens[0]).toMatchObject({
      responsavelPerfil: 'ACOMPANHAMENTO',
      responsavelId: ids.carla,
      tarefa: { status: 'PENDENTE', origem: 'REUNIAO', prazo: '2026-12-05', cicloNumero: null },
    });
    const r = await h.patch(
      `/api/mentoria/tarefas/${hoje.id}`,
      { version: hoje.version, status: 'FEITA' },
      s,
    );
    expect(r.status, r.text).toBe(200);
    expect((await doTipo(s, 'COBRANCA')).map((x) => x.referenciaId)).toEqual([vencida.id]);
  });

  it('a da reunião da Especialista vai para ela, que só vê as dela; pausado fica fora', async () => {
    const i = await inscricao();
    await emDia(i);
    const esp = await igor('ESPECIALISTA');
    const dela = await tarefa(i, '2026-12-08', ids.igor!);
    const outra = await tarefa(i, '2026-12-08');
    const pausada = await inscricao({ status: 'PAUSADO' });
    await tarefa(pausada, '2026-12-08');

    const minha = await doTipo(esp, 'COBRANCA', 'MINHA');
    expect(minha.map((x) => [x.referenciaId, x.responsavelPerfil, x.responsavelId])).toEqual([
      [dela.id, 'ESPECIALISTA', ids.igor],
    ]);
    const s = await carla();
    expect((await doTipo(s, 'COBRANCA', 'MINHA')).map((x) => x.referenciaId)).toEqual([outra.id]);
    expect((await doTipo(s, 'COBRANCA')).map((x) => x.inscricaoId)).not.toContain(pausada);
  });

  it('push às 8h do dia do prazo, uma vez só, para o responsável', async () => {
    const i = await inscricao();
    await emDia(i);
    await tarefa(i, '2026-12-09');
    await carla();
    await aparelho('carla');
    await disparar(em('2026-12-09', '07:59'));
    expect(para('carla')).toHaveLength(0);
    await disparar(em('2026-12-09', '08:00'));
    expect(para('carla')).toHaveLength(1);
    await disparar(em('2026-12-09', '15:00'));
    expect(para('carla')).toHaveLength(1);
  });
});

describe('SEMAFORO (E18)', () => {
  it('fora do verde entra com o motivo; "visto nesta semana" tira até a próxima semana', async () => {
    const i = await inscricao();
    const s = await carla();
    let [item] = await doTipo(s, 'SEMAFORO', 'MINHA');
    expect(item).toMatchObject({
      inscricaoId: i,
      chave: `semaforo:${i}:2026-12-07`,
      atrasado: true,
      responsavelId: ids.carla,
      semaforo: { cor: 'VERMELHO', motivos: ['CHECKIN_2'] },
    });
    const r = await h.post('/api/mentoria/fila/feito', { chave: item!.chave }, s);
    expect(r.status, r.text).toBe(204);
    expect(await doTipo(s, 'SEMAFORO')).toEqual([]);
    relogio.set(em('2026-12-14'));
    [item] = await doTipo(s, 'SEMAFORO');
    expect(item?.chave).toBe(`semaforo:${i}:2026-12-14`);
  });

  it('amarelo não é atrasado; verde sai; Especialista e Operação não recebem', async () => {
    const i = await inscricao();
    await owner`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu, respondido_em)
      values (${i}, '2026-11-25T12:00:00-03:00', true, '2026-11-25T15:00:00-03:00')`;
    const s = await carla();
    const [item] = await doTipo(s, 'SEMAFORO');
    expect(item).toMatchObject({ atrasado: false, semaforo: { cor: 'AMARELO' } });
    expect(await doTipo(await igor('ESPECIALISTA'), 'SEMAFORO')).toEqual([]);
    expect(await doTipo(await igor('OPERACAO'), 'SEMAFORO')).toEqual([]);
    await owner`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu, respondido_em)
      values (${i}, '2026-12-02T12:00:00-03:00', true, '2026-12-02T15:00:00-03:00')`;
    expect(await doTipo(s, 'SEMAFORO')).toEqual([]);
  });

  it('push só no vermelho, uma vez por semana; o visto não avisa', async () => {
    const vermelho = await inscricao();
    const amarelo = await inscricao();
    await owner`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu, respondido_em)
      values (${amarelo}, '2026-11-25T12:00:00-03:00', true, '2026-11-25T15:00:00-03:00')`;
    await carla();
    await aparelho('carla');
    await disparar(em('2026-12-08', '08:00'));
    expect(para('carla')).toHaveLength(1);
    expect(
      await owner`select chave from mentoria_avisos_enviados where chave like 'semaforo%'`,
    ).toEqual([{ chave: `semaforo-vermelho:${vermelho}:2026-12-07` }]);
    await disparar(em('2026-12-10', '08:00'));
    expect(para('carla')).toHaveLength(1);
    // Semana seguinte: o amarelo virou vermelho e avisa; o vermelho já visto na semana, não.
    await owner`insert into mentoria_fila_feitos (chave, feito_por)
      values (${`semaforo:${vermelho}:2026-12-14`}, ${ids.carla!})`;
    await disparar(em('2026-12-14', '08:00'));
    expect(para('carla')).toHaveLength(2);
    expect(
      (
        await owner<{ chave: string }[]>`
        select chave from mentoria_avisos_enviados where chave like 'semaforo%' order by chave`
      ).map((r) => r.chave),
    ).toEqual(
      [
        `semaforo-vermelho:${amarelo}:2026-12-14`,
        `semaforo-vermelho:${vermelho}:2026-12-07`,
      ].sort(),
    );
  });

  it('o despertador acorda às 8h do dia seguinte mesmo sem aviso armado', async () => {
    await disparar(em('2026-12-08', '15:00'));
    expect(avisos.armedAt).toBe(em('2026-12-09', '08:00'));
  });
});

describe('ENVIAR_PME (E19)', () => {
  it('depois do encerramento, para a Operação; sai com o envio do seguinte', async () => {
    const i = await inscricao();
    await emDia(i);
    await ciclo(i, { numero: 1, enviado: '2026-10-20', concluido: '2026-12-01' });
    const doze = await inscricao();
    await emDia(doze);
    await ciclo(doze, { numero: 12, enviado: '2026-10-20', concluido: '2026-12-01' });
    const terminou = await inscricao({ termino: '2026-12-07' });
    await emDia(terminou);
    await ciclo(terminou, { numero: 3, enviado: '2026-10-20', concluido: '2026-12-01' });

    const op = await igor('OPERACAO');
    const itens = await doTipo(op, 'ENVIAR_PME', 'MINHA');
    expect(itens.map((x) => [x.inscricaoId, x.ciclo?.numero])).toEqual([[i, 1]]);
    expect(itens[0]).toMatchObject({ responsavelPerfil: 'OPERACAO', responsavelId: null });
    await owner`insert into mentoria_pmes (numero, ativo) values (2, true)
      on conflict (numero) do update set ativo = true`;
    const r = await h.post(`/api/mentoria/inscricoes/${i}/ciclos`, {}, op);
    expect(r.status, r.text).toBe(201);
    expect(await doTipo(op, 'ENVIAR_PME')).toEqual([]);
  });
});

describe('PME_ATRASADO (E20)', () => {
  it('o degrau mais alto do prazo atual; o contato do degrau conclui; o seguinte volta', async () => {
    const i = await inscricao();
    await emDia(i);
    // Prazo 29/11: em 08/12, 9 dias de atraso = degrau 7.
    const c = await ciclo(i, { enviado: '2026-10-30' });
    const s = await carla();
    let [item] = await doTipo(s, 'PME_ATRASADO', 'MINHA');
    expect(item).toMatchObject({
      chave: `pme-atrasado:${c}:2026-11-29:7`,
      referenciaId: c,
      atrasado: true,
      responsavelId: ids.carla,
      ciclo: { numero: 1, prazoAtual: '2026-11-29', diasAtraso: 9, degrau: 7 },
    });
    const contato = (degrau: number) =>
      h.post(
        '/api/mentoria/contatos',
        { inscricaoId: i, canal: 'WHATSAPP', cicloId: c, degrau },
        s,
      );
    const dez = await contato(10);
    expect(dez.status).toBe(400);
    expect(dez.body.message).toBe('O PME ainda não tem 10 dias de atraso');
    expect((await contato(7)).status).toBe(201);
    expect(await doTipo(s, 'PME_ATRASADO')).toEqual([]);
    const [g] = await owner<{ motivo: string; degrau_prazo: string }[]>`
      select motivo, to_char(degrau_prazo, 'YYYY-MM-DD') as degrau_prazo
      from mentoria_contatos where ciclo_id = ${c}`;
    expect(g).toEqual({
      motivo: '1º PME, 7 dias de atraso: Áudio ou vídeo da Duda',
      degrau_prazo: '2026-11-29',
    });
    relogio.set(em('2026-12-09'));
    [item] = await doTipo(s, 'PME_ATRASADO');
    expect(item?.ciclo?.degrau).toBe(10);
  });

  it('segunda chance recomeça a escada do novo prazo; ciclo fechado sai', async () => {
    const i = await inscricao();
    await emDia(i);
    const c = await ciclo(i, { enviado: '2026-10-30' });
    const s = await carla();
    const [v] = await owner<
      { version: number }[]
    >`select version from mentoria_ciclos where id = ${c}`;
    const r = await h.patch(
      `/api/mentoria/ciclos/${c}`,
      { version: v!.version, segundaChanceAte: '2026-12-15' },
      s,
    );
    expect(r.status, r.text).toBe(200);
    expect(await doTipo(s, 'PME_ATRASADO')).toEqual([]);
    relogio.set(em('2026-12-17'));
    expect(await doTipo(s, 'PME_ATRASADO')).toEqual([]);
    relogio.set(em('2026-12-18'));
    const [item] = await doTipo(s, 'PME_ATRASADO');
    expect(item?.chave).toBe(`pme-atrasado:${c}:2026-12-15:3`);
    await owner`update mentoria_ciclos set concluido_em = '2026-12-18' where id = ${c}`;
    expect(await doTipo(s, 'PME_ATRASADO')).toEqual([]);
  });

  it('push uma vez por degrau, às 8h do dia; contato registrado não avisa', async () => {
    const i = await inscricao();
    await emDia(i);
    const c = await ciclo(i, { enviado: '2026-10-30' }); // prazo 29/11
    await carla();
    await aparelho('carla');
    relogio.set(em('2026-12-01'));
    await disparar(em('2026-12-02', '08:00')); // 3 dias
    expect(para('carla')).toHaveLength(1);
    await disparar(em('2026-12-04', '08:00'));
    expect(para('carla')).toHaveLength(1);
    await owner`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal, ciclo_id, degrau)
      values (${i}, ${ids.carla!}, now(), 'WHATSAPP', ${c}, 7)`;
    await disparar(em('2026-12-06', '08:00')); // 7 dias, já com contato
    expect(para('carla')).toHaveLength(1);
    await disparar(em('2026-12-09', '08:00')); // 10 dias
    expect(para('carla')).toHaveLength(2);
  });
});

describe('ação FIM_PME espera o ciclo (E21)', () => {
  const acoesDoMes = async (s: string, mes: number) =>
    (await doTipo(s, 'ACAO')).filter((x: FilaItemDTO) => x.acao?.mes === mes);
  const gerar = (i: string) => owner`select mentoria_gerar_acoes(${i}::uuid, '2026-10-01'::date)`;

  it('sem ciclo, a data da Fase 1; aberto, espera; fechado, a data do encerramento', async () => {
    const i = await inscricao();
    await emDia(i);
    await gerar(i);
    const s = await carla();
    // Mês 2 da Fase 1: 01/11 + 25 dias = 26/11.
    let [a] = await acoesDoMes(s, 2);
    expect(a?.venceEm).toBe(new Date(em('2026-11-26', '00:00')).toISOString());
    const c = await ciclo(i, { numero: 2, enviado: '2026-11-20' });
    expect(await acoesDoMes(s, 2)).toEqual([]);
    await owner`update mentoria_ciclos set concluido_em = '2026-12-05' where id = ${c}`;
    [a] = await acoesDoMes(s, 2);
    expect(a).toMatchObject({
      venceEm: new Date(em('2026-12-05', '00:00')).toISOString(),
      atrasado: true,
    });
  });

  it('mês 2 aparece com 15 dias de atraso do prazo atual; os outros meses seguem esperando', async () => {
    const i = await inscricao({ inicio: '2026-07-01' });
    await emDia(i);
    await gerar(i);
    // 2º PME com prazo 24/11: 14 dias em 08/12, 15 em 09/12.
    await ciclo(i, { numero: 2, enviado: '2026-10-25' });
    const s = await carla();
    expect(await acoesDoMes(s, 2)).toEqual([]);
    relogio.set(em('2026-12-09'));
    const [a] = await acoesDoMes(s, 2);
    expect(a?.venceEm).toBe(new Date(em('2026-12-09', '00:00')).toISOString());
    expect(await acoesDoMes(s, 4)).toHaveLength(1); // sem ciclo 4: data da Fase 1 (25/10)
  });

  it('o push da ação sai no dia do encerramento, não no da Fase 1', async () => {
    const i = await inscricao();
    await emDia(i);
    await gerar(i);
    await owner`update mentoria_acoes set responsavel_id = ${ids.carla!}
      where inscricao_id = ${i} and mes = 2`;
    const c = await ciclo(i, { numero: 2, enviado: '2026-11-20' });
    await carla();
    await aparelho('carla');
    await disparar(em('2026-11-26', '08:00'));
    expect(
      await owner`select chave from mentoria_avisos_enviados where chave like 'acao:%'`,
    ).toEqual([]);
    await owner`update mentoria_ciclos set concluido_em = '2026-12-05' where id = ${c}`;
    await disparar(em('2026-12-05', '08:00'));
    expect(
      (
        await owner<{ n: number }[]>`
        select count(*)::int as n from mentoria_avisos_enviados where chave like 'acao:%'`
      )[0]!.n,
    ).toBe(1);
  });
});

describe('aba 7 "PMEs e ciclos" e CSV (E22)', () => {
  it('lista o ciclo mais recente e o próximo PME; filtra; Especialista 404', async () => {
    const fechado = await inscricao();
    await ciclo(fechado, { numero: 1, enviado: '2026-10-01', concluido: '2026-10-25' });
    const aberto = await inscricao();
    await owner`insert into mentoria_pmes (numero, ativo) values (1, true)
      on conflict (numero) do update set ativo = true`;
    const s = await carla();
    const env = await h.post(
      `/api/mentoria/inscricoes/${aberto}/ciclos`,
      { enviadoEm: '2026-11-01' },
      s,
    );
    expect(env.status, env.text).toBe(201);
    const extra = (env.body as CicloDTO).tarefas.find((t) => t.origem === 'EXTRA');
    if (extra) await owner`update mentoria_tarefas set status = 'FEITA' where id = ${extra.id}`;
    const sem = await inscricao();

    const listar = async (b: object = {}) => {
      const r = await h.post('/api/mentoria/pmes-ciclos', b, s);
      expect(r.status, r.text).toBe(200);
      return r.body as PmeCicloLinha[];
    };
    const tudo = await listar();
    const de = (id: string) => tudo.find((l) => l.inscricaoId === id)!;
    expect(de(fechado)).toMatchObject({
      ciclo: { numero: 1, status: 'CONCLUIDO', encerramentoFeito: true, diasAtraso: 0 },
      proximoPme: 2,
    });
    expect(de(aberto)).toMatchObject({
      ciclo: {
        numero: 1,
        enviadoEm: '2026-11-01',
        prazoAtual: '2026-12-01',
        status: 'EM_ANDAMENTO',
        diasAtraso: 7,
        encerramentoFeito: false,
        extrasFeitas: extra ? 1 : 0,
      },
      proximoPme: null,
    });
    expect(de(sem)).toMatchObject({ ciclo: null, proximoPme: 1 });
    expect((await listar({ status: 'SEM_PME' })).map((l) => l.inscricaoId)).toEqual([sem]);
    expect((await listar({ status: 'CONCLUIDO', numero: 1 })).map((l) => l.inscricaoId)).toEqual([
      fechado,
    ]);
    expect((await h.post('/api/mentoria/pmes-ciclos', {}, await igor('OPERACAO'))).status).toBe(
      200,
    );
    expect((await h.post('/api/mentoria/pmes-ciclos', {}, await igor('ESPECIALISTA'))).status).toBe(
      404,
    );
  });

  it('o CSV de Mentorados leva PME atual, status do ciclo e semáforo', async () => {
    // O CSV conta pelo dia de hoje de verdade (como o mês da jornada): sem check-in desde outubro,
    // vermelho em qualquer data depois do fim de outubro de 2026.
    await owner`update mentoria_semaforo_inicio set desde = '2026-10-01'`;
    const i = await inscricao({ inicio: '2026-09-01' });
    await ciclo(i, { numero: 1, enviado: '2026-10-01', concluido: '2026-10-25' });
    const s = await carla();
    const r = await h.post('/api/mentoria/exportar', { aba: 'MENTORADOS' }, s);
    expect(r.status, r.text).toBe(200);
    const [cab, linha] = r.text.trim().split(/\r?\n/);
    expect(cab).toContain('"PME atual";"Status do PME";"Semáforo"');
    expect(linha).toContain('"1º PME";"Concluído";"Vermelho"');
  });
});
