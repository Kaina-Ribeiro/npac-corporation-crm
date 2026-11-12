// Fila do dia mais rápida (docs/plans/desempenho.md, Fase 6): a 0064 refaz `mentoria_fila` sem
// função por linha que relê pausas sob a RLS. A versão da 0053 é recriada aqui com outro nome, a
// partir do texto da migration, e as duas têm de devolver exatamente as mesmas linhas, na mesma
// ordem, para cada usuário e horário, sobre dados variados (gerados com semente fixa).
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

beforeAll(async () => {
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
  await owner`drop function if exists mentoria_fila_0053(timestamptz)`;
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_fila_feitos`;
  await owner`delete from mentoria_perfis where user_id like 'fq-%'`;
  await owner`delete from "user" where id like 'fq-%'`;
  await closeTestConnections();
});

describe('mentoria_fila da 0064 = a da 0053', () => {
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
