import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { withUser, type Db } from '@npac/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DB } from '../src/common/db/db.module.js';
import { BASE_ETAPA, mesJornadaJoin, RETOMADA_JOIN } from '../src/mentoria/contas-lista.js';
import { MENTORIA_CLOCK } from '../src/mentoria/relogio.js';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// NPAC-69 (auditoria de 23/11/2026): o painel do Onboarding e a lista de Mentorados chamavam
// `mentoria_onboarding_base`, `mentoria_mes_jornada` e `mentoria_semaforo` uma vez por linha (e de
// novo no WHERE dos filtros). Agora a conta vem na própria consulta (`contas-lista.ts`) e o
// semáforo de `mentoria_semaforo_lote`. Aqui as versões novas têm de dar exatamente o mesmo que as
// funções, para cada cargo, sobre dados variados (semente fixa): pausas fechadas antes, durante e
// depois do início da jornada, pausa aberta, etapas enviadas antes e depois da retomada, check-ins
// que dão as três cores do semáforo, "só a carteira" e a Especialista.

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let db: Db;
const ids: Record<string, string> = {};
let desdeOriginal: string;
let carteira: string[] = [];

// Como nos outros testes do módulo, a Carla faz cada perfil; a Diretoria é ela mesma.
type Cenario = { nome: string; perfil?: string; admin?: boolean; carteira?: boolean };
const CENARIOS: Cenario[] = [
  { nome: 'Diretoria' },
  { nome: 'Admin', perfil: 'ACOMPANHAMENTO', admin: true },
  { nome: 'Acompanhamento', perfil: 'ACOMPANHAMENTO' },
  { nome: 'Operação', perfil: 'OPERACAO' },
  { nome: 'Só a carteira', perfil: 'ACOMPANHAMENTO', carteira: true },
  { nome: 'Especialista', perfil: 'ESPECIALISTA' },
];

async function como(c: Cenario): Promise<{ user: string; cookie: Cookie }> {
  if (!c.perfil) return { user: ids.diretor!, cookie: await h.signIn('diretor@npac.com.br') };
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin)
    values (${ids.carla!}, ${c.perfil}, ${c.admin ?? false})`;
  if (c.carteira)
    await owner`update area_membros set alcance = 'CARTEIRA'
      where user_id = ${ids.carla!} and area = 'ACOMPANHAMENTO'`;
  return { user: ids.carla!, cookie: await h.signIn('carla@npac.com.br') };
}
const DIA = 86_400_000;
const DIA_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const rnd = mulberry32(69);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const chance = (p: number) => rnd() < p;

/** Data de Brasília `dias` antes de hoje (negativo = depois). */
const data = (dias: number) => DIA_BR.format(new Date(Date.now() - dias * DIA));
/** Instante `dias` antes de agora, numa hora qualquer. */
const instante = (dias: number) =>
  new Date(Date.now() - dias * DIA - int(0, 23) * 3_600_000).toISOString();

async function gerar() {
  const responsaveis = [ids.carla!, ids.diretor!, null];
  for (let n = 0; n < 70; n++) {
    const id = randomUUID();
    const status = pick(['ONBOARDING', 'ONBOARDING', 'ATIVO', 'ATIVO', 'PAUSADO', 'CANCELADO']);
    const inicio = chance(0.15) ? null : data(int(-20, 420));
    const responsavel = pick(responsaveis);
    const casal = chance(0.3);
    await owner`insert into mentoria_inscricoes (id, tipo, mentoria, status, inicio_jornada, responsavel_id)
      values (${id}, ${casal ? 'CASAL' : 'INDIVIDUAL'}, ${pick(['RDV', '2M', '6M'])}, ${status},
        ${inicio}, ${responsavel})`;
    for (let o = 1; o <= (casal ? 2 : 1); o++) {
      const nome = `Equivalência ${String(n).padStart(2, '0')}-${o}`;
      await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
        values (${id}, ${o}, ${nome}, ${nome.toLowerCase()})`;
    }
    // Pausas em sequência, sem sobrepor; a última pode ficar aberta (PAUSADO).
    let comeco = int(30, 500);
    for (let k = int(0, 3); k > 0; k--) {
      const dur = int(0, 60);
      const aberta = k === 1 && status === 'PAUSADO';
      await owner`insert into mentoria_pausas (inscricao_id, inicio, fim, status_anterior)
        values (${id}, ${data(comeco)}, ${aberta ? null : data(Math.max(comeco - dur, -10))},
          ${pick(['ATIVO', 'ONBOARDING'])})`;
      comeco = comeco - dur - int(1, 40);
      if (comeco < 0) break;
    }
    for (const etapa of [
      'BOAS_VINDAS',
      'GRUPOS',
      'AQUECIMENTO',
      'PME_AQUECIMENTO',
      'CAIXA',
      'IDR',
    ]) {
      const st = pick(['PENDENTE', 'ENVIADA', 'ENVIADA', 'CONCLUIDA', 'DISPENSADA']);
      const enviada = st === 'PENDENTE' && chance(0.7) ? null : instante(int(0, 400));
      await owner`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status, enviada_em)
        values (${id}, ${etapa}, ${st}, ${enviada})`;
    }
    // Check-ins das duas últimas semanas encerradas: respondidos ou não, para as três cores.
    for (const semanas of [1, 2]) {
      if (!chance(0.5)) continue;
      // Quarta-feira da semana encerrada: dias desde a segunda desta semana + 2 (ou + 9).
      const enviado = instante(((new Date().getDay() + 6) % 7) + 7 * semanas - 2);
      await owner`insert into mentoria_checkins (inscricao_id, enviado_em, respondido_em, respondeu)
        values (${id}, ${enviado}, ${enviado}, true) on conflict do nothing`;
    }
    // A Especialista vê só as inscrições em que conduz reunião.
    if (chance(0.3))
      await owner`insert into mentoria_reunioes (inscricao_id, tipo, inicio, conduzida_por)
        values (${id}, 'POSICIONAMENTO', ${instante(int(1, 30))}, ${ids.carla!})`;
  }
}

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  db = app.get(DB);
  app.get<{ reset(): void }>(MENTORIA_CLOCK).reset();
  for (const u of ['carla', 'diretor']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
  const [d] = await owner<{ desde: string }[]>`
    select to_char(desde, 'YYYY-MM-DD') as desde from mentoria_semaforo_inicio`;
  desdeOriginal = d!.desde;
  await owner`update mentoria_semaforo_inicio set desde = ${data(400)}`;
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await gerar();
  carteira = (
    await owner<
      { id: string }[]
    >`select id from mentoria_inscricoes where responsavel_id = ${ids.carla!}`
  ).map((r) => r.id);
});
afterAll(async () => {
  await owner`update mentoria_semaforo_inicio set desde = ${desdeOriginal}`;
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  await closeTestApp(app);
});

describe('dados gerados', () => {
  it('cobrem os casos que importam', async () => {
    const [c] = await owner<{ n: number; pausadas: number; abertas: number; ativos: number }[]>`
      select (select count(*) from mentoria_inscricoes)::int as n,
        (select count(distinct inscricao_id) from mentoria_pausas where fim is not null)::int as pausadas,
        (select count(*) from mentoria_pausas where fim is null)::int as abertas,
        (select count(*) from mentoria_inscricoes where status = 'ATIVO')::int as ativos`;
    expect(c!.n).toBe(70);
    expect(c!.pausadas).toBeGreaterThan(10);
    expect(c!.abertas).toBeGreaterThan(0);
    expect(c!.ativos).toBeGreaterThan(10);
    expect(carteira.length).toBeGreaterThan(5);
  });
});

describe('contas na consulta = funções do banco, por cargo', () => {
  it('base da etapa do Onboarding = mentoria_onboarding_base', async () => {
    let comPausa = 0;
    for (const c of CENARIOS) {
      const { user } = await como(c);
      const u = c.nome;
      const linhas = await withUser(db, user, (tx) =>
        tx.execute<{
          id: string;
          nova: string | null;
          antiga: string | null;
          retomada: unknown;
        }>(sql`
          select e.id, ${BASE_ETAPA}::text as nova, mentoria_onboarding_base(e.id)::text as antiga,
            ob_r.retomada
          from mentoria_inscricoes i ${RETOMADA_JOIN}
          join mentoria_onboarding_etapas e on e.inscricao_id = i.id`),
      );
      if (!c.perfil) expect(linhas.length).toBe(70 * 6);
      for (const l of linhas) {
        expect(l.nova, `${u} ${l.id}`).toBe(l.antiga);
        if (l.retomada) comPausa += 1;
      }
    }
    expect(comPausa).toBeGreaterThan(30);
  });

  it('mês da jornada = mentoria_mes_jornada, em vários dias', async () => {
    const dias = [data(0), data(-1), data(31), data(200), data(-400)];
    let comMes = 0;
    for (const c of CENARIOS) {
      const { user } = await como(c);
      const u = c.nome;
      for (const dia of dias) {
        const hoje = sql`${dia}::date`;
        const linhas = await withUser(db, user, (tx) =>
          tx.execute<{ id: string; nova: number | null; antiga: number | null }>(sql`
            select i.id, mj.mes as nova, mentoria_mes_jornada(i.id, ${hoje}) as antiga
            from mentoria_inscricoes i ${mesJornadaJoin(hoje)}`),
        );
        for (const l of linhas) {
          expect(l.nova, `${u} ${dia} ${l.id}`).toBe(l.antiga);
          if (l.nova !== null) comMes += 1;
        }
      }
    }
    expect(comMes).toBeGreaterThan(100);
  });

  it('semáforo em lote = mentoria_semaforo por inscrição', async () => {
    const cores = new Set<string>();
    for (const c of CENARIOS) {
      const { user } = await como(c);
      const u = c.nome;
      for (const dia of [data(0), data(7)]) {
        const linhas = await withUser(db, user, (tx) =>
          tx.execute<{
            id: string;
            nova: string | null;
            antiga: string | null;
            m1: unknown;
            m2: unknown;
          }>(sql`
            select i.id, s.cor as nova, s.motivos as m1, a.cor as antiga, a.motivos as m2
            from mentoria_inscricoes i
            left join mentoria_semaforo_lote(${dia}::date) s on s.inscricao_id = i.id
            left join lateral mentoria_semaforo(i.id, ${dia}::date) a on true`),
        );
        for (const l of linhas) {
          expect([l.nova, l.m1], `${u} ${dia} ${l.id}`).toEqual([l.antiga, l.m2]);
          if (l.nova) cores.add(l.nova);
        }
      }
    }
    expect([...cores].sort()).toEqual(['AMARELO', 'VERDE', 'VERMELHO']);
  });
});

describe('lista de Mentorados filtrada = a de antes', () => {
  // A consulta de antes (mesmos filtros pelas funções por linha), para comparar ids, ordem e total.
  async function antes(user: string, filtro: { mes?: number; semaforo?: string }) {
    const dia = DIA_BR.format(new Date(app.get<{ now(): number }>(MENTORIA_CLOCK).now()));
    const w = [
      filtro.mes
        ? sql`mentoria_mes_jornada(i.id, (now() at time zone 'America/Sao_Paulo')::date) = ${filtro.mes}`
        : sql`true`,
      filtro.semaforo
        ? sql`(select s.cor from mentoria_semaforo(i.id, ${dia}::date) s) = ${filtro.semaforo}`
        : sql`true`,
    ];
    return withUser(db, user, (tx) =>
      tx.execute<{ id: string }>(sql`
        select i.id from mentoria_inscricoes i
        join mentoria_pessoas p1 on p1.inscricao_id = i.id and p1.ordem = 1
        where ${sql.join(w, sql` and `)}
        order by p1.nome_norm, i.id`),
    );
  }

  it('mês, semáforo e os dois juntos, para cada cargo', async () => {
    const filtros = [
      {},
      { mes: 1 },
      { mes: 2 },
      { mes: 5 },
      { mes: 12 },
      { semaforo: 'VERDE' },
      { semaforo: 'AMARELO' },
      { semaforo: 'VERMELHO' },
      { mes: 3, semaforo: 'VERMELHO' },
    ];
    let naoVazias = 0;
    for (const c of CENARIOS) {
      const { user, cookie } = await como(c);
      const u = c.nome;
      for (const f of filtros) {
        const r = await h.post('/api/mentoria/inscricoes/lista', f, cookie);
        expect(r.status, r.text).toBe(200);
        const body = r.body as { itens: { id: string }[]; total: number };
        const esperado = (await antes(user, f)).map((l) => l.id);
        expect(
          body.itens.map((i) => i.id),
          `${u} ${JSON.stringify(f)}`,
        ).toEqual(esperado.slice(0, 50));
        expect(body.total, `${u} ${JSON.stringify(f)}`).toBe(esperado.length);
        if (c.carteira) for (const id of esperado) expect(carteira).toContain(id);
        if (esperado.length) naoVazias += 1;
      }
    }
    expect(naoVazias).toBeGreaterThan(15);
  });
});
