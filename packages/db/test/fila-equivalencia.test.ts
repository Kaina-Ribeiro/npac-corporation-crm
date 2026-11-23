// Fila do dia mais rápida (docs/plans/desempenho.md, Fase 6): a 0064 refaz `mentoria_fila` sem
// função por linha que relê pausas sob a RLS. A versão da 0053 é recriada aqui com outro nome, a
// partir do texto da migration, e as duas têm de devolver exatamente as mesmas linhas, na mesma
// ordem, para cada usuário e horário, sobre dados variados (gerados com semente fixa).
// Fase 2, Parte 4 (0070): a Fila ganha COBRANCA, SEMAFORO, ENVIAR_PME e PME_ATRASADO e a ação FIM_PME
// espera o ciclo. Sem ciclos, tarefas e com o semáforo desligado (entrada no ar no futuro), tudo igual à
// 0053; com eles, os tipos antigos continuam iguais (menos as FIM_PME com ciclo) e o semáforo em lote
// (`mentoria_semaforo_lote_calc`) = o da 0069 por inscrição (`mentoria_semaforo_calc`).
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const DIRETOR = 'fq-diretor';
const HEAD = 'fq-head';
const SDR = 'fq-sdr';
const DUDA = 'fq-duda'; // Acompanhamento + Admin
const ACOMP = 'fq-acomp';
const OPERACAO = 'fq-operacao';
const MANU = 'fq-manu'; // Especialista com várias reuniões
const MANU2 = 'fq-manu2'; // Especialista com poucas
const LEO = 'fq-leo'; // Mentor
const CARLA = 'fq-carla'; // Acompanhamento sem perfil
const INATIVO = 'fq-inativo'; // Acompanhamento desativado
const TODOS = [DIRETOR, HEAD, SDR, DUDA, ACOMP, OPERACAO, MANU, MANU2, LEO, CARLA, INATIVO];

const DIA = 86_400_000;
/** Quinta, 10/12/2026, 10h de Brasília: os dados são gerados em volta deste instante. */
const BASE = Date.parse('2026-12-10T10:00:00-03:00');
const AGORAS = [
  '2026-12-10T10:00:00-03:00', // dia comum
  '2026-12-10T23:30:00-03:00', // fim do dia em Brasília, já dia 11 em UTC
  '2027-01-01T08:30:00-03:00', // dia 1º: agenda do mês e reuniões do 6M
  '2027-01-05T07:00:00-03:00', // antes das 8h
  '2026-11-20T10:00:00-03:00', // antes do fim de algumas pausas: os dias parados param em "hoje"
  '2026-12-05T10:00:00-03:00', // dia em que a pausa da borda (abaixo) termina
];
const TIPOS = [
  'BOAS_VINDAS',
  'PASSO_DEVIDO',
  'PARADO',
  'ENVIAR_CAIXA',
  'CAIXA_ATRASADA',
  'AGENDAR_IDR',
  'LEMBRETE_IDR',
  'LINK_IDR',
  'ENVIAR_PME1',
  'ACAO',
  'FOTO_FAMILIA',
  'AGENDA_MES',
  'REUNIOES_6M',
  'REUNIAO_HOJE',
];

/** Gerador com semente: os mesmos dados a cada execução. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const rnd = mulberry32(47);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const chance = (p: number) => rnd() < p;
/** Instante `dias` antes de BASE, às `hora` de Brasília. */
const ts = (dias: number, hora = int(7, 21)) =>
  new Date(BASE - dias * DIA + (hora - 10) * 3_600_000).toISOString();
/** Data de Brasília `dias` antes de BASE. */
const data = (dias: number) => new Date(BASE - dias * DIA).toISOString().slice(0, 10);

const ETAPAS = ['BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO', 'PME_AQUECIMENTO', 'CAIXA', 'IDR'];

async function gerar(n: number) {
  for (let k = 0; k < n; k++) {
    const importada = chance(0.2);
    const [i] = await owner<{ id: string; status: string }[]>`
      insert into mentoria_inscricoes (tipo, mentoria, status, importada, criado_em,
        inicio_jornada, responsavel_id, pme1_enviado_em)
      values ('INDIVIDUAL', ${pick(['RDV', 'RDV', '2M', '6M'])},
        ${pick(['ONBOARDING', 'ATIVO', 'ATIVO', 'ATIVO', 'PAUSADO', 'CANCELADO', 'CONCLUIDO'])},
        ${importada}, ${ts(int(0, 40))}, ${chance(0.15) ? null : data(int(-20, 420))},
        ${pick([null, DUDA, ACOMP, INATIVO])}, ${chance(0.5) ? null : ts(int(0, 60))})
      returning id, status`;
    const id = i!.id;
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${id}, 1, ${`Mentorado Fictício ${k}`}, ${`mentorado ficticio ${k}`})`;

    // Pausas fechadas (a "retomada" é o fim da mais recente) e, se pausada, uma aberta.
    for (let p = int(0, 3); p > 0; p--) {
      const ini = int(5, 430);
      await owner`insert into mentoria_pausas (inscricao_id, inicio, fim, status_anterior)
        values (${id}, ${data(ini)}, ${data(Math.max(ini - int(0, 60), 0))}, 'ATIVO')`;
    }
    // Pausa aberta: a de quem está pausado e, às vezes, uma fora do normal (ativa com pausa
    // aberta), que a conta dos dias parados também soma.
    if (i!.status === 'PAUSADO' || chance(0.1))
      await owner`insert into mentoria_pausas (inscricao_id, inicio, status_anterior)
        values (${id}, ${data(int(0, 30))}, 'ATIVO')`;

    for (const etapa of ETAPAS) {
      const st =
        importada && chance(0.7)
          ? 'ANTERIOR_AO_SISTEMA'
          : pick(['PENDENTE', 'PENDENTE', 'ENVIADA', 'CONCLUIDA', 'DISPENSADA']);
      const enviada = st === 'ENVIADA' || st === 'CONCLUIDA' || chance(0.1) ? ts(int(0, 40)) : null;
      const concluida = (st === 'CONCLUIDA' || st === 'DISPENSADA') && chance(0.85);
      await owner`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status, enviada_em,
          concluida_em, atualizado_em, formulario_preenchido)
        values (${id}, ${etapa}, ${st}, ${enviada}, ${concluida ? ts(int(0, 30)) : null},
          ${ts(int(0, 40))}, ${etapa === 'BOAS_VINDAS' ? pick([null, true, false]) : null})`;
    }
    // O gatilho marca agora; metade fica sem data (vale a última alteração da etapa).
    await owner`update mentoria_onboarding_etapas
      set formulario_preenchido_em = ${chance(0.5) ? null : ts(int(0, 10))}
      where inscricao_id = ${id} and formulario_preenchido`;

    // Ações do plano (antes das reuniões: reunião realizada conclui a ação do tipo).
    await owner`select mentoria_gerar_acoes(${id}::uuid, ${data(0)}::date)`;
    await owner`update mentoria_acoes set status = 'FEITA', feita_em = now()
      where inscricao_id = ${id} and mes % 3 = ${int(0, 2)}`;
    await owner`update mentoria_acoes set responsavel_id = ${pick([OPERACAO, MANU, INATIVO, null])}
      where inscricao_id = ${id} and mes % 4 = ${int(0, 3)}`;

    for (let r = int(0, 3); r > 0; r--) {
      // Metade no dia (de Brasília) de um dos horários testados, para entrar como "hoje".
      const dia = pick(AGORAS).slice(0, 10);
      const hora = String(int(6, 22)).padStart(2, '0');
      const inicio = chance(0.5)
        ? `${dia}T${hora}:${pick(['00', '30'])}:00-03:00`
        : ts(int(-10, 60));
      const [reuniao] = await owner<{ id: string; tipo: string }[]>`
        insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status)
        values (${id}, ${pick(['IDR', 'IDR', 'ACOMP_2PME', 'POSICIONAMENTO', 'MENSAL_6M'])},
          ${pick([MANU, MANU, MANU2, DUDA, ACOMP, OPERACAO, LEO, INATIVO])}, ${inicio},
          ${pick(['AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO', 'REALIZADA', 'FALTOU', 'REMARCADA'])})
        returning id, tipo`;
      if (reuniao!.tipo === 'IDR' && chance(0.3))
        await owner`insert into mentoria_fila_feitos (chave, feito_por)
          values (${`lembrete-idr:${reuniao!.id}`}, ${DUDA})`;
    }
    if (chance(0.15))
      await owner`insert into mentoria_fila_feitos (chave, feito_por)
        values (${`boas-vindas:${id}`}, ${DUDA})`;
  }
  await owner`insert into mentoria_fila_feitos (chave, feito_por) values ('agenda-mes:2027-01', ${DUDA})`;

  // Borda que o sorteio não garante: em 20/11 a pausa (10/11 a 05/12) conta só 10 dias, porque
  // os dias parados param em "hoje"; com 25, o RDV que começou em 05/02 cairia para o mês 9.
  const [b] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status, importada, criado_em, inicio_jornada)
    values ('INDIVIDUAL', 'RDV', 'ATIVO', false, ${ts(300)}, '2026-02-05') returning id`;
  await owner`insert into mentoria_pausas (inscricao_id, inicio, fim, status_anterior)
    values (${b!.id}, '2026-11-10', '2026-12-05', 'ATIVO')`;
  borda = b!.id;
}
let borda = '';

/** Corpo da `mentoria_fila` como a 0053 o criou, com outro nome. */
function filaDa0053(): string {
  const texto = readFileSync(
    new URL('../drizzle/0053_acompanhamento_v2_fila.sql', import.meta.url),
    'utf8',
  );
  const ini = texto.indexOf('CREATE FUNCTION mentoria_fila(');
  const fim = texto.indexOf('$$;', ini);
  if (ini < 0 || fim < 0) throw new Error('mentoria_fila não achada na 0053');
  return texto
    .slice(ini, fim + 3)
    .replace('CREATE FUNCTION mentoria_fila(', 'CREATE FUNCTION mentoria_fila_0053(');
}

const fila = (u: string, agora: string, fn: 'mentoria_fila' | 'mentoria_fila_0053') =>
  withUser(db, u, async (tx) => [
    ...(await tx.execute<{ chave: string; tipo: string }>(
      sql`select * from ${sql.raw(fn)}(${agora}::timestamptz)`,
    )),
  ]);

let desdeOriginal = '';

beforeAll(async () => {
  const [s] = await owner<{ desde: string }[]>`
    select to_char(desde, 'YYYY-MM-DD') as desde from mentoria_semaforo_inicio`;
  desdeOriginal = s!.desde;
  // Semáforo desligado na primeira parte: nenhuma semana vale e nenhuma tarefa conta.
  await owner`update mentoria_semaforo_inicio set desde = '2999-01-01'`;
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_fila_feitos`;
  await owner`delete from mentoria_perfis where user_id like 'fq-%'`;
  await owner`delete from "user" where id like 'fq-%'`;
  await owner`
    insert into "user" (id, name, email, role, can_prospect, can_close, active) values
      (${DIRETOR}, 'Diretor FQ', 'diretor@fq.test', 'DIRETOR', false, false, true),
      (${HEAD}, 'Head FQ', 'head@fq.test', 'HEAD', false, false, true),
      (${SDR}, 'Sdr FQ', 'sdr@fq.test', 'SDR', true, false, true),
      (${DUDA}, 'Duda FQ', 'duda@fq.test', 'ACOMPANHAMENTO', false, false, true),
      (${ACOMP}, 'Acomp FQ', 'acomp@fq.test', 'ACOMPANHAMENTO', false, false, true),
      (${OPERACAO}, 'Op FQ', 'op@fq.test', 'ACOMPANHAMENTO', false, false, true),
      (${MANU}, 'Manu FQ', 'manu@fq.test', 'ACOMPANHAMENTO', false, false, true),
      (${MANU2}, 'Manu2 FQ', 'manu2@fq.test', 'ACOMPANHAMENTO', false, false, true),
      (${LEO}, 'Leo FQ', 'leo@fq.test', 'ACOMPANHAMENTO', false, false, true),
      (${CARLA}, 'Carla FQ', 'carla@fq.test', 'ACOMPANHAMENTO', false, false, true),
      (${INATIVO}, 'Inativo FQ', 'inativo@fq.test', 'ACOMPANHAMENTO', false, false, false)`;
  await owner`
    insert into mentoria_perfis (user_id, perfil, admin) values
      (${DUDA}, 'ACOMPANHAMENTO', true),
      (${ACOMP}, 'ACOMPANHAMENTO', false),
      (${OPERACAO}, 'OPERACAO', false),
      (${MANU}, 'ESPECIALISTA', false),
      (${MANU2}, 'ESPECIALISTA', false),
      (${LEO}, 'MENTOR', false),
      (${INATIVO}, 'ACOMPANHAMENTO', false)`;
  await gerar(150);
  await owner`analyze`;
  await owner.unsafe(filaDa0053());
  await owner`grant execute on function mentoria_fila_0053(timestamptz) to npac_app`;
  // Um em cada seis itens, de todos os tipos, já concluído (some por `mentoria_fila_feitos`).
  const feitos = (await fila(DIRETOR, AGORAS[0]!, 'mentoria_fila_0053'))
    .filter((_, k) => k % 6 === 0)
    .map((l) => ({ chave: l.chave, feito_por: DUDA }));
  await owner`insert into mentoria_fila_feitos ${owner(feitos)} on conflict do nothing`;
}, 120_000);

afterAll(async () => {
  await owner`update mentoria_semaforo_inicio set desde = ${desdeOriginal}`;
  await owner`drop function if exists mentoria_fila_0053(timestamptz)`;
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_fila_feitos`;
  await owner`delete from mentoria_perfis where user_id like 'fq-%'`;
  await owner`delete from "user" where id like 'fq-%'`;
  await closeTestConnections();
});

describe('mentoria_fila da 0070 = a da 0053 sem ciclos nem semáforo', () => {
  it.each(TODOS)('%s: mesmas linhas, na mesma ordem, em cada horário', async (u) => {
    for (const agora of AGORAS) {
      const antiga = await fila(u, agora, 'mentoria_fila_0053');
      const nova = await fila(u, agora, 'mentoria_fila');
      expect({ u, agora, linhas: nova }).toEqual({ u, agora, linhas: antiga });
    }
  });

  it('os dados exercitam todos os tipos, as pausas e a RLS', async () => {
    const tipos = new Set<string>();
    for (const agora of AGORAS)
      for (const l of await fila(DIRETOR, agora, 'mentoria_fila')) tipos.add(l.tipo);
    expect([...tipos].sort()).toEqual([...TIPOS].sort());

    // Etapa enviada antes da última retomada: a base do prazo é a retomada, não o envio.
    const [envio] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_onboarding_etapas e
      join mentoria_inscricoes i on i.id = e.inscricao_id
      where i.status in ('ONBOARDING', 'ATIVO') and e.status = 'ENVIADA'
        and (select max(p.fim) from mentoria_pausas p
             where p.inscricao_id = e.inscricao_id and p.fim is not null)
          > (e.enviada_em at time zone 'America/Sao_Paulo')::date`;
    expect(envio!.n).toBeGreaterThan(0);
    // RDV perto do mês 10 com dias parados: as pausas mudam o mês da jornada.
    const [rdv] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_inscricoes i
      where i.status in ('ONBOARDING', 'ATIVO') and i.mentoria = 'RDV'
        and i.foto_familia_midia_id is null
        and i.inicio_jornada + interval '9 months' <= ${data(0)}::date
        and mentoria_dias_pausados(i.id, ${data(0)}::date) > 0`;
    expect(rdv!.n).toBeGreaterThan(0);
    const [abertas] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_pausas p
      join mentoria_inscricoes i on i.id = p.inscricao_id
      where p.fim is null and i.status in ('ONBOARDING', 'ATIVO')`;
    expect(abertas!.n).toBeGreaterThan(0);
    const [feitos] = await owner<{ n: number }[]>`
      select count(distinct split_part(chave, ':', 1))::int as n from mentoria_fila_feitos`;
    expect(feitos!.n).toBeGreaterThanOrEqual(8);
    const dia20 = await fila(DIRETOR, '2026-11-20T10:00:00-03:00', 'mentoria_fila');
    expect(dia20.map((l) => l.chave)).toContain(`foto-familia:${borda}`);

    const tudo = await fila(DIRETOR, AGORAS[0]!, 'mentoria_fila');
    const manu = await fila(MANU, AGORAS[0]!, 'mentoria_fila');
    expect(manu.length).toBeGreaterThan(0);
    expect(manu.length).toBeLessThan(tudo.length);
    // Fora do módulo, a RLS não deixa ver inscrição: sobram os itens do mês, que não leem tabela
    // (a API dá 404 antes de chegar aqui).
    const sdr = await fila(SDR, AGORAS[0]!, 'mentoria_fila');
    expect(sdr.map((l) => l.tipo)).toEqual(['AGENDA_MES']);
  });

  it('continua SECURITY INVOKER, STABLE, do owner e só para npac_app', async () => {
    const [f] = await owner<
      { secdef: boolean; vol: string; dono: string; publico: boolean; app: boolean }[]
    >`
      select p.prosecdef as secdef, p.provolatile as vol, pg_get_userbyid(p.proowner) as dono,
        has_function_privilege('public', p.oid, 'execute') as publico,
        has_function_privilege('npac_app', p.oid, 'execute') as app
      from pg_proc p where p.proname = 'mentoria_fila'`;
    expect(f).toEqual({ secdef: false, vol: 's', dono: 'npac_owner', publico: false, app: true });
  });
});

// ---------------------------------------------------------------------------------------------
// Parte 4: ciclos, tarefas, check-ins e contatos dos degraus sobre os mesmos mentorados.

/** Data `n` dias depois de `iso` (YYYY-MM-DD). */
const mais = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const NOVOS = ['COBRANCA', 'SEMAFORO', 'ENVIAR_PME', 'PME_ATRASADO'];
const diaDe = (agora: string) =>
  new Date(agora).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
/** Dias de Brasília dos horários testados. */
const DIAS = [...new Set(AGORAS.map(diaDe))];
let fimComCiclo = new Set<string>();

async function gerarParte4() {
  const ativos = await owner<{ id: string }[]>`
    select id from mentoria_inscricoes where status in ('ATIVO', 'PAUSADO') order by id`;
  for (const a of ativos) {
    if (chance(0.25)) continue;
    // Ciclos 1..n: os anteriores fechados ou não concluídos, o último aberto ou fechado.
    const n = int(1, 5);
    let envio = data(int(70, 160));
    for (let k = 1; k <= n; k++) {
      const proximo = mais(envio, int(25, 40));
      const ultimo = k === n || Date.parse(proximo) > BASE;
      const fechado = ultimo ? chance(0.35) : chance(0.7);
      const concluido = fechado ? mais(envio, int(3, 40)) : null;
      const naoConcluido = !ultimo && !fechado ? proximo : null;
      const segunda = ultimo && !fechado && chance(0.3) ? mais(envio, 30 + int(1, 12)) : null;
      const [c] = await owner<{ id: string }[]>`
        insert into mentoria_ciclos (inscricao_id, numero, enviado_em, concluido_em,
          nao_concluido_em, segunda_chance_ate)
        values (${a.id}, ${k}, ${envio}, ${concluido}, ${naoConcluido}, ${segunda})
        returning id`;
      if (ultimo && !fechado) {
        for (let e = int(0, 2); e > 0; e--)
          await owner`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao,
              prazo, status)
            values (${a.id}, 'EXTRA', ${c!.id}, 'cifrado', ${mais(envio, 30)},
              ${pick(['PENDENTE', 'PENDENTE', 'FEITA'])})`;
        await owner`insert into mentoria_tarefas (inscricao_id, origem, ciclo_id, descricao, prazo)
          values (${a.id}, 'ENCERRAMENTO', ${c!.id}, 'cifrado', ${mais(envio, 30)})`;
        if (chance(0.4))
          await owner`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal,
              ciclo_id, degrau)
            values (${a.id}, ${DUDA}, now(), 'WHATSAPP', ${c!.id}, ${pick([3, 7, 10, 15])})`;
      }
      if (ultimo) break;
      envio = proximo;
    }
    // Tarefas da reunião: a da Manu é dela; as outras, do responsável.
    for (let r = int(0, 2); r > 0; r--) {
      const [reuniao] = await owner<{ id: string }[]>`
        insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio, status)
        values (${a.id}, 'POSICIONAMENTO', ${pick([MANU, MANU2, DUDA, ACOMP, INATIVO])},
          ${ts(int(5, 40))}, 'REALIZADA') returning id`;
      for (let t = int(1, 3); t > 0; t--)
        await owner`insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, descricao,
            prazo, status)
          values (${a.id}, 'REUNIAO', ${reuniao!.id}, 'cifrado', ${data(int(-10, 40))},
            ${pick(['PENDENTE', 'PENDENTE', 'FEITA', 'PARCIAL', 'NAO_FEITA'])})`;
    }
    // Check-ins de semanas diferentes, respondidos ou não.
    for (const k of [0, 7, 14, 21, 28, 35])
      if (chance(0.5)) {
        const respondeu = chance(0.6);
        await owner`insert into mentoria_checkins (inscricao_id, enviado_em, respondeu,
            respondido_em)
          values (${a.id}, ${ts(k, 12)}, ${respondeu}, ${respondeu ? ts(k, 14) : null})
          on conflict do nothing`;
      }
  }
}

describe('Parte 4: tipos novos sem quebrar os antigos', () => {
  beforeAll(async () => {
    await gerarParte4();
    // Semáforo ligado 30 dias antes do dia-base: semanas e tarefas passam a contar.
    await owner`update mentoria_semaforo_inicio set desde = ${data(30)}`;
    // Alguns "visto nesta semana".
    const semana = await owner<{ chave: string }[]>`
      select chave from mentoria_fila(${AGORAS[0]!}::timestamptz) where tipo = 'SEMAFORO'`;
    const vistos = semana
      .filter((_, k) => k % 4 === 0)
      .map((l) => ({ chave: l.chave, feito_por: DUDA }));
    if (vistos.length)
      await owner`insert into mentoria_fila_feitos ${owner(vistos)} on conflict do nothing`;
    fimComCiclo = new Set(
      (
        await owner<{ id: string }[]>`
          select a.id from mentoria_acoes a join mentoria_ciclos c
            on c.inscricao_id = a.inscricao_id and c.numero = a.mes
          where a.gatilho = 'FIM_PME'`
      ).map((r) => `acao:${r.id}`),
    );
    await owner`analyze`;
  }, 120_000);

  it('semáforo em lote = o da 0069, inscrição por inscrição, em vários dias', async () => {
    const dias = [...DIAS, data(-3), data(10), data(-20)];
    let vermelhos = 0;
    let amarelos = 0;
    for (const dia of dias) {
      const lote = await owner<{ id: string; cor: string; motivos: string[] }[]>`
        select inscricao_id as id, cor, motivos from mentoria_semaforo_lote_calc(${dia}::date)
        order by inscricao_id`;
      const um = await owner<{ id: string; cor: string; motivos: string[] }[]>`
        select i.id, s.cor, s.motivos from mentoria_inscricoes i
        cross join lateral mentoria_semaforo_calc(i.id, ${dia}::date) s
        order by i.id`;
      expect({ dia, lote: [...lote] }).toEqual({ dia, lote: [...um] });
      vermelhos += lote.filter((l) => l.cor === 'VERMELHO').length;
      amarelos += lote.filter((l) => l.cor === 'AMARELO').length;
    }
    expect(vermelhos).toBeGreaterThan(0);
    expect(amarelos).toBeGreaterThan(0);
  });

  it.each(TODOS)('%s: os tipos antigos continuam iguais aos da 0053', async (u) => {
    const antigo = (l: { chave: string; tipo: string }) =>
      !NOVOS.includes(l.tipo) && !fimComCiclo.has(l.chave);
    for (const agora of AGORAS) {
      const antiga = (await fila(u, agora, 'mentoria_fila_0053')).filter(antigo);
      const nova = (await fila(u, agora, 'mentoria_fila')).filter(antigo);
      expect({ u, agora, linhas: nova }).toEqual({ u, agora, linhas: antiga });
    }
  });

  it('SEMAFORO = fora do verde no semáforo da 0069, menos o visto, só para quem vê o semáforo', async () => {
    const feitos = new Set(
      (await owner<{ chave: string }[]>`select chave from mentoria_fila_feitos`).map(
        (f) => f.chave,
      ),
    );
    let total = 0;
    for (const agora of AGORAS) {
      const dia = diaDe(agora);
      const esperado = await owner<{ chave: string; atrasado: boolean }[]>`
        select 'semaforo:' || i.id || ':'
            || to_char(date_trunc('week', ${dia}::date), 'YYYY-MM-DD') as chave,
          s.cor = 'VERMELHO' as atrasado
        from mentoria_inscricoes i
        cross join lateral mentoria_semaforo_calc(i.id, ${dia}::date) s
        where s.cor <> 'VERDE'`;
      const ref = esperado
        .filter((e) => !feitos.has(e.chave))
        .map((e) => `${e.chave}|${e.atrasado}`)
        .sort();
      total += ref.length;
      for (const u of [DIRETOR, DUDA, OPERACAO]) {
        const sem = (await fila(u, agora, 'mentoria_fila'))
          .filter((l) => l.tipo === 'SEMAFORO')
          .map((l) => `${l.chave}|${(l as unknown as { atrasado: boolean }).atrasado}`)
          .sort();
        expect({ u, agora, sem }).toEqual({ u, agora, sem: ref });
      }
      for (const u of [MANU, MANU2, LEO, CARLA, SDR])
        expect(
          (await fila(u, agora, 'mentoria_fila')).filter((l) => l.tipo === 'SEMAFORO'),
        ).toEqual([]);
    }
    expect(total).toBeGreaterThan(0);
  });

  it('os dados exercitam os quatro tipos novos; a Especialista só cobra as reuniões dela', async () => {
    const tipos = new Set<string>();
    for (const agora of AGORAS)
      for (const l of await fila(DIRETOR, agora, 'mentoria_fila')) tipos.add(l.tipo);
    for (const t of NOVOS) expect(tipos).toContain(t);

    const manu = (await fila(MANU, AGORAS[0]!, 'mentoria_fila')).filter(
      (l) => l.tipo === 'COBRANCA',
    );
    expect(manu.length).toBeGreaterThan(0);
    const refs = manu.map((l) => (l as unknown as { referencia_id: string }).referencia_id);
    const [fora] = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_tarefas t
      left join mentoria_reunioes r on r.id = t.reuniao_id
      where t.id = any(${refs}::uuid[]) and r.conduzida_por is distinct from ${MANU}`;
    expect(fora!.n).toBe(0);
  });

  it('o contato do degrau pega o prazo atual do ciclo e recusa ciclo de outro mentorado', async () => {
    const [c] = await owner<{ id: string; inscricao_id: string; pa: string }[]>`
      select id, inscricao_id, to_char(coalesce(segunda_chance_ate, prazo), 'YYYY-MM-DD') as pa
      from mentoria_ciclos where concluido_em is null and nao_concluido_em is null
      order by id limit 1`;
    const [outra] = await owner<{ id: string }[]>`
      select id from mentoria_inscricoes where id <> ${c!.inscricao_id} order by id limit 1`;
    const [ct] = await withUser(db, OPERACAO, (tx) =>
      tx.execute<{ degrau_prazo: string }>(sql`
        insert into mentoria_contatos (inscricao_id, feito_por, quando, canal, ciclo_id, degrau)
        values (${c!.inscricao_id}::uuid, app_user_id(), now(), 'WHATSAPP', ${c!.id}::uuid, 3)
        returning to_char(degrau_prazo, 'YYYY-MM-DD') as degrau_prazo`),
    );
    expect(ct!.degrau_prazo).toBe(c!.pa);
    await expect(
      owner`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal, ciclo_id, degrau)
        values (${outra!.id}, ${DUDA}, now(), 'WHATSAPP', ${c!.id}, 7)`,
    ).rejects.toThrow(/outro mentorado/);
    await expect(
      owner`insert into mentoria_contatos (inscricao_id, feito_por, quando, canal, degrau)
        values (${c!.inscricao_id}, ${DUDA}, now(), 'WHATSAPP', 7)`,
    ).rejects.toThrow(/outro mentorado/);
  });

  it('Fila, push e semáforo em lote rodam sem JIT (no banco pequeno a compilação levava ~700 ms)', async () => {
    const linhas = await owner<{ proname: string; config: string[] | null }[]>`
      select proname, proconfig as config from pg_proc
      where proname in ('mentoria_fila', 'mentoria_avisos_candidatos', 'mentoria_semaforo_lote_calc')`;
    expect(linhas).toHaveLength(3);
    for (const l of linhas)
      expect({ f: l.proname, jit: l.config }).toMatchObject({
        jit: expect.arrayContaining(['jit=off']),
      });
  });

  it('o semáforo em lote é interno; o da Fila só responde a quem vê o semáforo', async () => {
    const [f] = await owner<{ calc: boolean; lote: boolean }[]>`
      select has_function_privilege('npac_app', 'mentoria_semaforo_lote_calc(date)', 'execute')
          as calc,
        has_function_privilege('npac_app', 'mentoria_semaforo_lote(date)', 'execute') as lote`;
    expect(f).toEqual({ calc: false, lote: true });
    const n = async (u: string) =>
      (
        await withUser(db, u, (tx) =>
          tx.execute(sql`select * from mentoria_semaforo_lote(${DIAS[0]!}::date)`),
        )
      ).length;
    expect(await n(OPERACAO)).toBeGreaterThan(0);
    expect(await n(MANU)).toBe(0);
    expect(await n(SDR)).toBe(0);
  });
});

describe('NPAC-56: "Nova inscrição" e "Venda estornada"', () => {
  const NOVOS = ['NOVA_INSCRICAO', 'VENDA_ESTORNADA'];
  let nova = '';
  let estornada = '';
  const QUEM = [DIRETOR, DUDA, OPERACAO, MANU];
  const antes = new Map<string, string[]>();

  beforeAll(async () => {
    for (const u of QUEM)
      antes.set(
        u,
        (await fila(u, AGORAS[0]!, 'mentoria_fila')).map((l) => l.chave),
      );
    const criar = async (status: string, responsavel: string | null) => {
      const [i] = await owner<{ id: string }[]>`
        insert into mentoria_inscricoes (tipo, mentoria, status, deal_id, responsavel_id)
        values ('INDIVIDUAL', 'RDV', ${status}, gen_random_uuid(), ${responsavel}) returning id`;
      await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
        values (${i!.id}, 1, 'Mentorado Fictício Venda', 'mentorado ficticio venda')`;
      return i!.id;
    };
    nova = await criar('ONBOARDING', null);
    await criar('ONBOARDING', ACOMP); // já tem responsável: sem item
    await criar('CANCELADO', null); // cancelada à mão, sem estorno: sem item
    estornada = await criar('CANCELADO', ACOMP);
    await owner`insert into mentoria_historico (inscricao_id, ator_id, tipo)
      values (${estornada}, ${DUDA}, 'inscricao.cancelada_pelo_estorno')`;
  });

  it('a Fila traz os dois itens com a pessoa certa e não muda os tipos antigos', async () => {
    const linhas = await withUser(db, DUDA, async (tx) => [
      ...(await tx.execute<{
        chave: string;
        tipo: string;
        inscricao_id: string;
        responsavel_perfil: string;
        responsavel_id: string | null;
      }>(sql`select * from mentoria_fila(${AGORAS[0]!}::timestamptz)
        where tipo in ('NOVA_INSCRICAO', 'VENDA_ESTORNADA') order by tipo`)),
    ]);
    expect(
      linhas.map((l) => [l.chave, l.tipo, l.inscricao_id, l.responsavel_perfil, l.responsavel_id]),
    ).toEqual([
      [`nova-inscricao:${nova}`, 'NOVA_INSCRICAO', nova, 'ACOMPANHAMENTO', null],
      [`venda-estornada:${estornada}`, 'VENDA_ESTORNADA', estornada, 'ACOMPANHAMENTO', ACOMP],
    ]);
    // Os outros tipos ficam como estavam antes das inscrições da venda.
    for (const u of QUEM) {
      const atual = (await fila(u, AGORAS[0]!, 'mentoria_fila')).filter(
        (l) => !NOVOS.includes(l.tipo),
      );
      expect({ u, linhas: atual.map((l) => l.chave) }).toEqual({ u, linhas: antes.get(u) });
    }
    // Fora do módulo (e a Especialista, que não vê a inscrição), nada.
    for (const u of [SDR, CARLA, MANU2])
      expect(
        (await fila(u, AGORAS[0]!, 'mentoria_fila')).filter((l) => NOVOS.includes(l.tipo)),
      ).toEqual([]);
  });

  it('o push vai à Admin (nova) e à responsável (estornada); o "Visto" tira a estornada', async () => {
    const avisos = async () =>
      (
        await owner<{ chave: string; user_ids: string[] }[]>`
          select chave, user_ids from mentoria_avisos_candidatos(${AGORAS[0]!}::timestamptz)
          where chave like 'nova-inscricao:%' or chave like 'venda-estornada:%' order by chave`
      ).map((a) => [a.chave, a.user_ids]);
    expect(await avisos()).toEqual([
      [`nova-inscricao:${nova}`, [DUDA]],
      [`venda-estornada:${estornada}`, [ACOMP]],
    ]);
    await owner`insert into mentoria_fila_feitos (chave, feito_por)
      values (${`venda-estornada:${estornada}`}, ${ACOMP})`;
    expect(await avisos()).toEqual([[`nova-inscricao:${nova}`, [DUDA]]]);
    expect(
      (await fila(ACOMP, AGORAS[0]!, 'mentoria_fila')).filter((l) => l.tipo === 'VENDA_ESTORNADA'),
    ).toEqual([]);
  });
});
