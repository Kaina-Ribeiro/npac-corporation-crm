// Permissão por consulta (plano docs/plans/desempenho.md, Fase 1): as políticas de leitura não
// chamam função por linha; as listas (`closer_lead_ids`, `mentoria_ids_especialista`) são
// calculadas uma vez por consulta e dão exatamente o mesmo resultado das funções antigas.
import { sql } from 'drizzle-orm';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appDb, closeTestConnections, ownerSql } from '../src/testing.js';
import { withUser } from '../src/with-user.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
const db = appDb(DB);

const q = <T extends Record<string, unknown>>(id: string, s: ReturnType<typeof sql>) =>
  withUser(db, id, async (tx) => [...(await tx.execute<T>(s))]);

/** Roda como owner (sem RLS) com `app.user_id` definido: compara função antiga e nova em todas as linhas. */
const comoOwner = async <T>(userId: string, fn: (s: TransactionSql) => Promise<T>): Promise<T> =>
  (await owner.begin(async (s) => {
    await s`select set_config('app.user_id', ${userId}, true)`;
    return fn(s);
  })) as T;

describe('teste-guarda', () => {
  it('nenhuma política de leitura chama função por linha', async () => {
    // O Postgres imprime `(select f())` como `( SELECT f() AS f)`: isso é calculado uma vez por
    // consulta. Sobrou chamada fora disso = função avaliada linha a linha.
    const rows = await owner<{ tablename: string; policyname: string }[]>`
      select tablename, policyname from pg_policies
      where schemaname = 'public'
        and (cmd in ('SELECT', 'ALL') or policyname = 'leads_update')
        and policyname <> 'mentoria_midia_leitura' -- mídia é lida uma linha por vez, pelo id
        and regexp_replace(
              coalesce(qual, '') || ' ' || coalesce(case when cmd = 'ALL' then with_check end, ''),
              '\\( SELECT [a-z_]+\\(\\) AS [a-z_]+\\)', '', 'g')
            ~ '(closer_has_lead|mentoria_[a-z_]+|app_role|app_user_id)\\('
      order by 1, 2`;
    expect(rows).toEqual([]);
  });

  it('leads_update não chama closer_has_lead', async () => {
    const [p] = await owner<{ qual: string }[]>`
      select qual from pg_policies where tablename = 'leads' and policyname = 'leads_update'`;
    expect(p?.qual).not.toMatch(/closer_has_lead\(/);
  });

  it('as funções novas são do owner, SECURITY DEFINER, STABLE e fechadas ao PUBLIC', async () => {
    const rows = await owner<
      {
        proname: string;
        secdef: boolean;
        vol: string;
        config: string[];
        publico: boolean;
        app: boolean;
      }[]
    >`
      select p.proname, p.prosecdef as secdef, p.provolatile as vol, p.proconfig as config,
        has_function_privilege('public', p.oid, 'execute') as publico,
        has_function_privilege('npac_app', p.oid, 'execute') as app
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('closer_lead_ids', 'mentoria_ve_todas', 'mentoria_ids_especialista')
      order by 1`;
    expect(rows.map((r) => r.proname)).toEqual([
      'closer_lead_ids',
      'mentoria_ids_especialista',
      'mentoria_ve_todas',
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({ secdef: true, vol: 's', publico: false, app: true });
      expect(r.config).toEqual(['search_path=public, pg_temp']);
    }
  });
});

// ---------------------------------------------------------------- comercial

const HEAD = 'p-head';
const SDR = 'p-sdr';
const SONIA = 'p-sonia';
const CARLOS = 'p-carlos';
const ZECA = 'p-zeca'; // closer sem nenhuma reunião
const RON = 'p-ron'; // HEAD que fecha venda
const L: Record<string, string> = {};

describe('comercial: closer_lead_ids', () => {
  beforeAll(async () => {
    await owner`truncate meetings, form_responses, deals, products, leads, pipeline_stages, audit_log restart identity cascade`;
    await owner`delete from "user" where id like 'p-%'`;
    await owner`
      insert into "user" (id, name, email, role, can_prospect, can_close) values
        (${HEAD}, 'Head P', 'head@p.test', 'HEAD', false, false),
        (${RON}, 'Ron P', 'ron@p.test', 'HEAD', false, true),
        (${SDR}, 'Sdr P', 'sdr@p.test', 'SDR', true, false),
        (${SONIA}, 'Sonia P', 'sonia@p.test', 'CLOSER', false, true),
        (${CARLOS}, 'Carlos P', 'carlos@p.test', 'CLOSER', false, true),
        (${ZECA}, 'Zeca P', 'zeca@p.test', 'CLOSER', false, true)`;
    const st = await owner<{ id: string; key: string }[]>`
      insert into pipeline_stages (key, label, position) values
        ('SONDAGEM', 'Sondagem', 1), ('AGENDOU_PAGAMENTO', 'Agendou pagamento', 2),
        ('EM_FOLLOW', 'Em follow', 3) returning id, key`;
    const stage = (k: string) => st.find((s) => s.key === k)!.id;
    const [prod] = await owner<{ id: string }[]>`
      insert into products (code, name, closer_id, price_cents)
      values ('PQ', 'Produto P', ${SONIA}, 100000) returning id`;

    const lead = async (nome: string, etapa: string, closer: string | null, excluido = false) => {
      const [r] = await owner<{ id: string }[]>`
        insert into leads (name, income_band, source, stage_id, sdr_id, created_by, closer_id, deleted_at)
        values (${nome}, 'R8_15K', 'INDICACAO', ${stage(etapa)}, ${SDR}, ${SDR}, ${closer},
          ${excluido ? new Date() : null}) returning id`;
      return r!.id;
    };
    const reuniao = async (leadId: string, closer: string, cancelada = false) => {
      await owner`
        insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by, canceled_at)
        values (${leadId}, ${closer}, now() + interval '1 day', 'DIRETO', ${SDR},
          ${cancelada ? new Date() : null})`;
    };
    let n = 0;
    const venda = async (leadId: string, closer: string, estornada = false) => {
      n += 1;
      await owner`
        insert into deals (lead_id, product_id, product_name, catalog_price_cents, closer_id, sdr_id,
          total_cents, method, created_by, request_key, reversed_at, reversed_by)
        values (${leadId}, ${prod!.id}, 'Produto P', 100000, ${closer}, ${SDR}, 100000, 'PIX', ${closer},
          ${`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`},
          ${estornada ? new Date() : null}, ${estornada ? HEAD : null})`;
    };

    L.reuniao = await lead('Reunião aberta', 'SONDAGEM', null);
    await reuniao(L.reuniao, SONIA);
    L.cancelada = await lead('Reunião cancelada', 'SONDAGEM', null);
    await reuniao(L.cancelada, SONIA, true);
    L.pagamento = await lead('Agendou pagamento', 'AGENDOU_PAGAMENTO', SONIA);
    L.venda = await lead('Venda ativa', 'EM_FOLLOW', SONIA);
    await venda(L.venda, SONIA);
    L.estornada = await lead('Venda estornada', 'EM_FOLLOW', SONIA);
    await venda(L.estornada, SONIA, true);
    L.semNada = await lead('Closer sem etapa nem venda', 'EM_FOLLOW', SONIA);
    L.vendaOutro = await lead('Venda de outro closer', 'EM_FOLLOW', SONIA);
    await venda(L.vendaOutro, CARLOS);
    L.excluido = await lead('Excluído com reunião', 'SONDAGEM', null, true);
    await reuniao(L.excluido, SONIA);
    L.pagamentoExcluido = await lead('Pagamento excluído', 'AGENDOU_PAGAMENTO', SONIA, true);
    L.carlos = await lead('Reunião do Carlos', 'SONDAGEM', null);
    await reuniao(L.carlos, CARLOS);
    L.ron = await lead('Reunião do Ron', 'SONDAGEM', null);
    await reuniao(L.ron, RON);
  });

  afterAll(async () => {
    await owner`truncate meetings, form_responses, deals, products, leads, pipeline_stages restart identity cascade`;
    await owner`delete from "user" where id like 'p-%'`;
  });

  const visiveis = async (u: string) =>
    (await q<{ name: string }>(u, sql`select name from leads order by name`)).map((r) => r.name);

  it('closer vê pelos quatro caminhos e só por eles', async () => {
    expect(await visiveis(SONIA)).toEqual(
      ['Agendou pagamento', 'Reunião aberta', 'Venda ativa'].sort(),
    );
    expect(await visiveis(CARLOS)).toEqual(['Reunião do Carlos']);
  });

  it('closer sem nenhuma reunião vê zero linhas, sem erro', async () => {
    expect(await visiveis(ZECA)).toEqual([]);
    const [r] = await comoOwner(
      ZECA,
      (s) => s<{ ids: string[] }[]>`select closer_lead_ids() as ids`,
    );
    expect(r?.ids).toEqual([]);
  });

  it('lead excluído some para o SDR dono e para o closer, não para a liderança', async () => {
    const sdr = await visiveis(SDR);
    expect(sdr).not.toContain('Excluído com reunião');
    expect(sdr).not.toContain('Pagamento excluído');
    expect(await visiveis(SONIA)).not.toContain('Excluído com reunião');
    const lider = await visiveis(HEAD);
    expect(lider).toContain('Excluído com reunião');
    expect(lider).toContain('Pagamento excluído');
    expect(lider).toHaveLength(Object.keys(L).length);
  });

  it('UPDATE segue a mesma regra da leitura', async () => {
    const altera = (u: string, id: string) =>
      q<{ id: string }>(
        u,
        sql`update leads set next_contact_at = now() where id = ${id} returning id`,
      );
    expect(await altera(SONIA, L.pagamento!)).toHaveLength(1);
    expect(await altera(SONIA, L.semNada!)).toHaveLength(0);
    expect(await altera(SONIA, L.excluido!)).toHaveLength(0);
    expect(await altera(ZECA, L.reuniao!)).toHaveLength(0);
  });

  it('closer_lead_ids dá o mesmo que closer_has_lead em todo lead, para todo usuário', async () => {
    for (const u of [HEAD, RON, SDR, SONIA, CARLOS, ZECA]) {
      const rows = await comoOwner(
        u,
        (s) => s<{ id: string; antes: boolean; depois: boolean }[]>`
          select l.id, closer_has_lead(l.id) as antes,
            coalesce(l.id = any (closer_lead_ids()), false) as depois
          from leads l`,
      );
      expect(rows.length).toBe(Object.keys(L).length);
      for (const r of rows)
        expect({ u, id: r.id, v: r.depois }).toEqual({ u, id: r.id, v: r.antes });
    }
  });

  it('sem usuário a lista é vazia', async () => {
    const [r] = await owner<{ ids: string[] }[]>`select closer_lead_ids() as ids`;
    expect(r?.ids).toEqual([]);
  });
});

// ---------------------------------------------------------------- Acompanhamento

const DIRETOR = 'p-diretor';
const DUDA = 'p-duda'; // Acompanhamento + Admin
const ACOMP = 'p-acomp';
const OPERACAO = 'p-operacao';
const MANU = 'p-manu'; // Especialista com reunião
const MANU2 = 'p-manu2'; // Especialista sem reunião
const LEO = 'p-leo'; // Mentor
const CARLA = 'p-carla'; // Acompanhamento sem perfil
const SDR2 = 'p-sdr2';
const TODOS = [DIRETOR, DUDA, ACOMP, OPERACAO, MANU, MANU2, LEO, CARLA, SDR2];

describe('Acompanhamento: mentoria_ve_todas e mentoria_ids_especialista', () => {
  let a = '';
  let b = '';
  let reuniaoManu = '';

  beforeAll(async () => {
    await owner`truncate mentoria_inscricoes cascade`;
    await owner`delete from mentoria_perfis where user_id like 'p-%'`;
    await owner`delete from "user" where id like 'p-%'`;
    await owner`
      insert into "user" (id, name, email, role, can_prospect, can_close) values
        (${DIRETOR}, 'Diretor P', 'diretor@p.test', 'DIRETOR', false, false),
        (${DUDA}, 'Duda P', 'duda@p.test', 'ACOMPANHAMENTO', false, false),
        (${ACOMP}, 'Acomp P', 'acomp@p.test', 'ACOMPANHAMENTO', false, false),
        (${OPERACAO}, 'Op P', 'op@p.test', 'ACOMPANHAMENTO', false, false),
        (${MANU}, 'Manu P', 'manu@p.test', 'ACOMPANHAMENTO', false, false),
        (${MANU2}, 'Manu2 P', 'manu2@p.test', 'ACOMPANHAMENTO', false, false),
        (${LEO}, 'Leo P', 'leo@p.test', 'ACOMPANHAMENTO', false, false),
        (${CARLA}, 'Carla P', 'carla@p.test', 'ACOMPANHAMENTO', false, false),
        (${SDR2}, 'Sdr2 P', 'sdr2@p.test', 'SDR', true, false)`;
    await owner`
      insert into mentoria_perfis (user_id, perfil, admin) values
        (${DUDA}, 'ACOMPANHAMENTO', true), (${ACOMP}, 'ACOMPANHAMENTO', false),
        (${OPERACAO}, 'OPERACAO', false), (${MANU}, 'ESPECIALISTA', false),
        (${MANU2}, 'ESPECIALISTA', false), (${LEO}, 'MENTOR', false),
        (${SDR2}, 'ESPECIALISTA', false)`;

    const inscricao = async (n: number) => {
      const [i] = await owner<{ id: string }[]>`
        insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto)
        values ('INDIVIDUAL', 'RDV', 'ATIVO', '2026-01-10', '2027-01-10') returning id`;
      await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
        values (${i!.id}, 1, ${`Mentorado Fictício P${n}`}, ${`mentorado ficticio p${n}`})`;
      await owner`select mentoria_gerar_acoes(${i!.id}::uuid, '2026-01-01'::date)`;
      return i!.id;
    };
    const reuniao = async (insc: string, condutor: string | null, tipo = 'POSICIONAMENTO') => {
      const [r] = await owner<{ id: string }[]>`
        insert into mentoria_reunioes (inscricao_id, tipo, conduzida_por, inicio)
        values (${insc}, ${tipo}, ${condutor}, now() - interval '2 hours') returning id`;
      return r!.id;
    };
    a = await inscricao(1);
    b = await inscricao(2);
    reuniaoManu = await reuniao(a, MANU);
    const reuniaoDudaA = await reuniao(a, DUDA, 'ACOMP_2PME');
    const reuniaoDudaB = await reuniao(b, DUDA, 'ACOMP_2PME');
    await reuniao(b, SDR2); // perfil sem o cargo: não dá acesso
    const [ciclo] = await owner<{ id: string }[]>`
      insert into mentoria_ciclos (inscricao_id, numero, enviado_em)
      values (${a}, 1, (now() at time zone 'America/Sao_Paulo')::date) returning id`;
    for (const r of [reuniaoManu, reuniaoDudaA]) {
      await owner`insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, ciclo_id, descricao, prazo)
        values (${a}, 'REUNIAO', ${r}, ${ciclo!.id}, 'cifrado', '2026-12-01')`;
    }
    await owner`insert into mentoria_tarefas (inscricao_id, origem, reuniao_id, descricao, prazo)
      values (${b}, 'REUNIAO', ${reuniaoDudaB}, 'cifrado', '2026-12-01')`;
    await owner`insert into mentoria_metas (inscricao_id, descricao) values (${a}, 'cifrado'), (${b}, 'cifrado')`;
  });

  afterAll(async () => {
    await owner`truncate mentoria_inscricoes cascade`;
    await owner`delete from mentoria_perfis where user_id like 'p-%'`;
    await owner`delete from "user" where id like 'p-%'`;
  });

  it('inscrições: mesma resposta de mentoria_ve para todo usuário', async () => {
    for (const u of TODOS) {
      const rows = await comoOwner(
        u,
        (s) => s<{ id: string; antes: boolean; depois: boolean }[]>`
          select i.id, mentoria_ve(i.id) as antes,
            coalesce(mentoria_ve_todas() or i.id = any (mentoria_ids_especialista()), false) as depois
          from mentoria_inscricoes i`,
      );
      expect(rows).toHaveLength(2);
      for (const r of rows)
        expect({ u, id: r.id, v: r.depois }).toEqual({ u, id: r.id, v: r.antes });
    }
  });

  it('reuniões, tarefas e metas: mesma resposta das funções por linha', async () => {
    for (const u of TODOS) {
      const reunioes = await comoOwner(
        u,
        (s) => s<{ antes: boolean; depois: boolean }[]>`
          select mentoria_ve_reuniao(r.conduzida_por, r.inscricao_id) as antes,
            coalesce(mentoria_ve_todas()
              or (mentoria_perfil() = 'ESPECIALISTA' and r.conduzida_por = app_user_id()), false) as depois
          from mentoria_reunioes r`,
      );
      expect(reunioes).toHaveLength(4);
      for (const r of reunioes) expect({ u, v: r.depois }).toEqual({ u, v: r.antes });

      const metas = await comoOwner(
        u,
        (s) => s<{ antes: boolean; depois: boolean }[]>`
          select mentoria_ve_meta(m.inscricao_id) as antes, coalesce(mentoria_ve_todas(), false) as depois
          from mentoria_metas m`,
      );
      expect(metas).toHaveLength(2);
      for (const r of metas) expect({ u, v: r.depois }).toEqual({ u, v: r.antes });
    }
  });

  it('o que cada perfil lê pela RLS', async () => {
    const conta = async (u: string, tabela: string) =>
      Number(
        (
          await q<{ n: string }>(u, sql`select count(*)::text as n from ${sql.identifier(tabela)}`)
        )[0]!.n,
      );
    const esperado: Record<string, Record<string, number>> = {
      [DIRETOR]: {
        mentoria_inscricoes: 2,
        mentoria_reunioes: 4,
        mentoria_tarefas: 3,
        mentoria_metas: 2,
      },
      [DUDA]: {
        mentoria_inscricoes: 2,
        mentoria_reunioes: 4,
        mentoria_tarefas: 3,
        mentoria_metas: 2,
      },
      [ACOMP]: {
        mentoria_inscricoes: 2,
        mentoria_reunioes: 4,
        mentoria_tarefas: 3,
        mentoria_metas: 2,
      },
      [OPERACAO]: {
        mentoria_inscricoes: 2,
        mentoria_reunioes: 4,
        mentoria_tarefas: 3,
        mentoria_metas: 2,
      },
      [MANU]: {
        mentoria_inscricoes: 1,
        mentoria_reunioes: 1,
        mentoria_tarefas: 1,
        mentoria_metas: 0,
      },
      [MANU2]: {
        mentoria_inscricoes: 0,
        mentoria_reunioes: 0,
        mentoria_tarefas: 0,
        mentoria_metas: 0,
      },
      [LEO]: {
        mentoria_inscricoes: 0,
        mentoria_reunioes: 0,
        mentoria_tarefas: 0,
        mentoria_metas: 0,
      },
      [CARLA]: {
        mentoria_inscricoes: 0,
        mentoria_reunioes: 0,
        mentoria_tarefas: 0,
        mentoria_metas: 0,
      },
      [SDR2]: {
        mentoria_inscricoes: 0,
        mentoria_reunioes: 0,
        mentoria_tarefas: 0,
        mentoria_metas: 0,
      },
    };
    for (const [u, tabelas] of Object.entries(esperado)) {
      const lido: Record<string, number> = {};
      for (const t of Object.keys(tabelas)) lido[t] = await conta(u, t);
      expect({ u, lido }).toEqual({ u, lido: tabelas });
    }
    // A Especialista vê a pessoa e as ações da inscrição dela, não a da outra.
    expect(await conta(MANU, 'mentoria_pessoas')).toBe(1);
    expect(await conta(MANU2, 'mentoria_acoes')).toBe(0);
  });

  it('Especialista sem reunião conduzida: lista vazia, sem erro', async () => {
    const [r] = await comoOwner(
      MANU2,
      (s) => s<{ ids: string[] }[]>`select mentoria_ids_especialista() as ids`,
    );
    expect(r?.ids).toEqual([]);
    const [o] = await comoOwner(
      OPERACAO,
      (s) => s<{ ids: string[] }[]>`select mentoria_ids_especialista() as ids`,
    );
    expect(o?.ids).toEqual([]);
  });

  it('tarefa da reunião da Especialista só aparece se a reunião é dela', async () => {
    const ids = await q<{ reuniao_id: string }>(MANU, sql`select reuniao_id from mentoria_tarefas`);
    expect(ids.map((r) => r.reuniao_id)).toEqual([reuniaoManu]);
  });
});

afterAll(async () => {
  await closeTestConnections();
});
