// Acesso por área, Fase 1 (NPAC-54): compatibilidade com a versão anterior do app e com os seeds e
// testes que ainda gravam o cargo do jeito antigo, as funções novas (com a regra de hoje), o resumo
// `user.role`, as invariantes e o teste-guarda "ninguém lê o cargo antigo". Banco próprio: a
// invariante "ao menos uma Diretoria ativa" precisa saber quantas Diretorias existem.
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appSql, closeTestConnections, ownerSql, resetTestDb } from '../src/testing.js';

const BANCO = 'npac_test_areas_compat';
const owner = ownerSql(BANCO);
const app = appSql(BANCO);

const pgError = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as { code: string; message: string };
  }
  throw new Error('esperava erro do banco');
};

/** Roda `fn` como npac_app (RLS), logado como `id`. */
const como = <T>(id: string, fn: (t: postgres.TransactionSql) => Promise<T>) =>
  app.begin(async (t) => {
    await t`select set_config('app.user_id', ${id}, true)`;
    return fn(t);
  }) as Promise<T>;

const vinculos = async (id: string) =>
  owner<{ area: string; cargo: string | null; head: boolean }[]>`
    select area, cargo, head from area_membros where user_id = ${id} order by area`;

const conta = async (id: string) =>
  (
    await owner<{ role: string; mestre: boolean; p: boolean; c: boolean }[]>`
      select role::text, mestre, can_prospect as p, can_close as c from "user" where id = ${id}`
  )[0];

beforeAll(async () => {
  await resetTestDb(BANCO);
  await owner`insert into "user" (id, name, email, role, can_prospect, can_close) values
    ('dir', 'Dir', 'dir@x.test', 'DIRETOR', false, false),
    ('head', 'Head', 'head@x.test', 'HEAD', true, false),
    ('head2', 'Head 2', 'head2@x.test', 'HEAD', false, true),
    ('sdr', 'SDR', 'sdr@x.test', 'SDR', true, false),
    ('sdr2', 'SDR 2', 'sdr2@x.test', 'SDR', true, false),
    ('closer', 'Closer', 'closer@x.test', 'CLOSER', false, true),
    ('admin', 'Admin', 'admin@x.test', 'ACOMPANHAMENTO', false, false),
    ('acomp', 'Acomp', 'acomp@x.test', 'ACOMPANHAMENTO', false, false),
    ('semperfil', 'Sem perfil', 'semperfil@x.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values
    ('admin', 'ACOMPANHAMENTO', true), ('acomp', 'OPERACAO', false)`;
}, 120_000);

afterAll(closeTestConnections);

describe('escrita antiga em user.role (gatilho de compatibilidade)', () => {
  it('inserir conta com cargo cria o vínculo; Diretoria vira mestre sem vínculo', async () => {
    expect(await vinculos('sdr')).toEqual([{ area: 'COMERCIAL', cargo: 'SDR', head: false }]);
    expect(await vinculos('head')).toEqual([{ area: 'COMERCIAL', cargo: 'HEAD', head: true }]);
    expect(await vinculos('semperfil')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: null, head: false },
    ]);
    expect(await vinculos('admin')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'ACOMPANHAMENTO', head: true },
    ]);
    expect(await vinculos('dir')).toEqual([]);
    expect(await conta('dir')).toMatchObject({ role: 'DIRETOR', mestre: true });
  });

  it('update "user" set role troca o vínculo, como o app antigo faz', async () => {
    await owner`update "user" set role = 'CLOSER', can_prospect = false, can_close = true
      where id = 'sdr2'`;
    expect(await vinculos('sdr2')).toEqual([{ area: 'COMERCIAL', cargo: 'CLOSER', head: false }]);

    await owner`update "user" set role = 'ACOMPANHAMENTO', can_prospect = false, can_close = false
      where id = 'sdr2'`;
    expect(await vinculos('sdr2')).toEqual([{ area: 'ACOMPANHAMENTO', cargo: null, head: false }]);

    await owner`update "user" set role = 'DIRETOR' where id = 'sdr2'`;
    expect(await vinculos('sdr2')).toEqual([]);
    expect(await conta('sdr2')).toMatchObject({ role: 'DIRETOR', mestre: true });

    await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false
      where id = 'sdr2'`;
    expect(await vinculos('sdr2')).toEqual([{ area: 'COMERCIAL', cargo: 'SDR', head: false }]);
    expect(await conta('sdr2')).toMatchObject({ role: 'SDR', mestre: false });
  });

  it('o mesmo cargo de novo mantém o perfil do Acompanhamento', async () => {
    await owner`update "user" set role = 'ACOMPANHAMENTO' where id = 'acomp'`;
    expect(await vinculos('acomp')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: false },
    ]);
  });

  it('o npac_app também grava assim (a API de hoje), mas nunca a coluna mestre direto', async () => {
    await como(
      'dir',
      (t) => t`update "user" set role = 'CLOSER', can_prospect = false,
      can_close = true where id = 'sdr2'`,
    );
    expect(await vinculos('sdr2')).toEqual([{ area: 'COMERCIAL', cargo: 'CLOSER', head: false }]);
    await como(
      'dir',
      (t) => t`update "user" set role = 'SDR', can_prospect = true,
      can_close = false where id = 'sdr2'`,
    );
    const e = await pgError(
      como('dir', (t) => t`update "user" set mestre = true where id = 'sdr'`),
    );
    expect(e.code).toBe('42501');
  });

  it('cargo trocado sem as caixas certas continua recusado pelo CHECK de antes', async () => {
    const e = await pgError(owner`update "user" set role = 'SDR' where id = 'head2'`);
    expect(e.code).toBe('23514');
    expect(await vinculos('head2')).toEqual([{ area: 'COMERCIAL', cargo: 'HEAD', head: true }]);
  });
});

describe('mentoria_definir_perfil (por cima de area_definir_membro)', () => {
  it('a Diretoria e o Admin do módulo dão e tiram perfil', async () => {
    await como('dir', (t) => t`select mentoria_definir_perfil('semperfil', 'MENTOR', false)`);
    expect(await vinculos('semperfil')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'MENTOR', head: false },
    ]);
    await como('admin', (t) => t`select mentoria_definir_perfil('semperfil', null, false)`);
    expect(await vinculos('semperfil')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: null, head: false },
    ]);
    expect(await conta('semperfil')).toMatchObject({ role: 'ACOMPANHAMENTO' });
  });

  it('mesmas recusas de antes: quem não é Admin (42501) e quem não é do Acompanhamento (22023)', async () => {
    expect(
      (
        await pgError(
          como('acomp', (t) => t`select mentoria_definir_perfil('semperfil', 'MENTOR', false)`),
        )
      ).code,
    ).toBe('42501');
    const e = await pgError(
      como('dir', (t) => t`select mentoria_definir_perfil('sdr', 'OPERACAO', false)`),
    );
    expect(e).toMatchObject({
      code: '22023',
      message: 'Só quem tem o cargo Acompanhamento recebe perfil',
    });
    // Perfil nulo para quem não é do Acompanhamento: nada acontece, como antes.
    await como('dir', (t) => t`select mentoria_definir_perfil('sdr', null, false)`);
    expect(await vinculos('sdr')).toEqual([{ area: 'COMERCIAL', cargo: 'SDR', head: false }]);
  });
});

describe('mentoria_perfis (visão só de leitura)', () => {
  it('npac_app lê pela RLS de antes: a própria linha; o Admin e a Diretoria, todas', async () => {
    const ler = (id: string) =>
      como(
        id,
        (t) => t<{ user_id: string; perfil: string; admin: boolean }[]>`
        select user_id, perfil, admin from mentoria_perfis order by user_id`,
      );
    const todas = [
      { user_id: 'acomp', perfil: 'OPERACAO', admin: false },
      { user_id: 'admin', perfil: 'ACOMPANHAMENTO', admin: true },
    ];
    expect(await ler('dir')).toEqual(todas);
    expect(await ler('admin')).toEqual(todas);
    expect(await ler('acomp')).toEqual([todas[0]]);
    expect(await ler('head')).toEqual([]);
    expect(await ler('semperfil')).toEqual([]);
  });

  it('area_membros pela RLS: a própria linha; o Head, a área dele; a Diretoria, todas', async () => {
    const ler = async (id: string) =>
      (
        await como(
          id,
          (t) => t<{ user_id: string; area: string }[]>`
          select user_id, area from area_membros order by area, user_id`,
        )
      ).map((r) => `${r.area}:${r.user_id}`);
    const todas = await owner<{ user_id: string; area: string }[]>`
      select user_id, area from area_membros order by area, user_id`;
    const de = (area: string) =>
      todas.filter((r) => r.area === area).map((r) => `${area}:${r.user_id}`);
    expect(await ler('dir')).toEqual(todas.map((r) => `${r.area}:${r.user_id}`));
    expect(await ler('head')).toEqual(de('COMERCIAL'));
    expect(await ler('admin')).toEqual(de('ACOMPANHAMENTO'));
    expect(await ler('acomp')).toEqual(['ACOMPANHAMENTO:acomp']);
    expect(await ler('sdr')).toEqual(['COMERCIAL:sdr']);
    expect(await ler('ninguem')).toEqual([]);
  });

  it('npac_app não escreve na visão nem em area_membros', async () => {
    for (const q of [
      (t: postgres.TransactionSql) =>
        t`insert into mentoria_perfis (user_id, perfil) values ('semperfil', 'MENTOR')`,
      (t: postgres.TransactionSql) => t`delete from mentoria_perfis`,
      (t: postgres.TransactionSql) =>
        t`update area_membros set head = true where user_id = 'acomp'`,
      (t: postgres.TransactionSql) =>
        t`insert into area_membros (user_id, area, cargo) values ('sdr', 'ACOMPANHAMENTO', 'MENTOR')`,
    ])
      expect((await pgError(como('dir', q))).code).toBe('42501');
  });

  it('o dono do banco (seeds e testes antigos) grava o perfil pela visão', async () => {
    await owner`insert into mentoria_perfis (user_id, perfil) values ('semperfil', 'ESPECIALISTA')`;
    expect(await vinculos('semperfil')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'ESPECIALISTA', head: false },
    ]);
    await owner`update mentoria_perfis set admin = true where user_id = 'semperfil'`;
    expect((await vinculos('semperfil'))[0]?.head).toBe(true);
    await owner`delete from mentoria_perfis where user_id = 'semperfil'`;
    expect(await vinculos('semperfil')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: null, head: false },
    ]);
    // Perfil para quem não é do Acompanhamento: ignorado (nunca valeu), sem virar segunda área.
    await owner`insert into mentoria_perfis (user_id, perfil) values ('sdr', 'MENTOR')`;
    expect(await vinculos('sdr')).toEqual([{ area: 'COMERCIAL', cargo: 'SDR', head: false }]);
  });
});

describe('funções novas (regra de hoje) e o resumo user.role', () => {
  it('area_definir_membro recalcula o resumo e as caixas que o cargo fixa', async () => {
    await como('dir', (t) => t`select area_definir_membro('closer', 'COMERCIAL', 'SDR', null)`);
    expect(await conta('closer')).toMatchObject({ role: 'SDR', p: true, c: false });
    await como('dir', (t) => t`select area_definir_membro('closer', 'COMERCIAL', 'CLOSER', true)`);
    expect(await conta('closer')).toMatchObject({ role: 'CLOSER', p: false, c: true });
    // Comercial: head = (cargo = HEAD), não importa o que vier.
    expect(await vinculos('closer')).toEqual([{ area: 'COMERCIAL', cargo: 'CLOSER', head: false }]);
  });

  it('Head do Comercial troca SDR e Closer; não dá Head nem mexe em Head ou no Acompanhamento', async () => {
    await como('head', (t) => t`select area_definir_membro('sdr', 'COMERCIAL', 'CLOSER', false)`);
    expect(await conta('sdr')).toMatchObject({ role: 'CLOSER', p: false, c: true });
    await como('head', (t) => t`select area_definir_membro('sdr', 'COMERCIAL', 'SDR', false)`);
    for (const q of [
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('sdr', 'COMERCIAL', 'HEAD', true)`,
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('head2', 'COMERCIAL', 'SDR', false)`,
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('acomp', 'COMERCIAL', 'SDR', false)`,
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('acomp', 'ACOMPANHAMENTO', 'MENTOR', false)`,
    ])
      expect((await pgError(como('head', q))).code).toBe('42501');
  });

  it('Admin do módulo troca perfil de quem é do Acompanhamento, e só', async () => {
    await como(
      'admin',
      (t) => t`select area_definir_membro('acomp', 'ACOMPANHAMENTO', 'MENTOR', false)`,
    );
    expect(await vinculos('acomp')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'MENTOR', head: false },
    ]);
    for (const q of [
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('sdr', 'ACOMPANHAMENTO', 'MENTOR', false)`,
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('sdr', 'COMERCIAL', 'CLOSER', false)`,
      (t: postgres.TransactionSql) => t`select area_remover_membro('acomp', 'ACOMPANHAMENTO')`,
      (t: postgres.TransactionSql) => t`select area_definir_mestre('acomp', true)`,
    ])
      expect((await pgError(como('admin', q))).code).toBe('42501');
  });

  it('validação: área e cargo inválidos, Diretoria sem cargo por área', async () => {
    const tenta = (q: string) => pgError(como('dir', (t) => t.unsafe(q)));
    expect(
      (await tenta(`select area_definir_membro('sdr', 'FINANCEIRO', 'SDR', false)`)).code,
    ).toBe('22023');
    expect(
      (await tenta(`select area_definir_membro('sdr', 'COMERCIAL', 'MENTOR', false)`)).code,
    ).toBe('22023');
    expect((await tenta(`select area_definir_membro('sdr', 'COMERCIAL', null, false)`)).code).toBe(
      '22023',
    );
    expect(
      (await tenta(`select area_definir_membro('dir2', 'COMERCIAL', 'SDR', false)`)).code,
    ).toBe('P0002');
    expect((await tenta(`select area_definir_membro('dir', 'COMERCIAL', 'SDR', false)`)).code).toBe(
      '22023',
    );
  });

  it('duas áreas (só a Diretoria): resumo = cargo comercial; o módulo vem do vínculo', async () => {
    await como(
      'dir',
      (t) => t`select area_definir_membro('closer', 'ACOMPANHAMENTO', 'ESPECIALISTA', false)`,
    );
    expect(await conta('closer')).toMatchObject({ role: 'CLOSER', p: false, c: true });
    const [r] = await como(
      'closer',
      (t) => t<{ role: string; perfil: string }[]>`
      select app_role()::text as role, mentoria_perfil() as perfil`,
    );
    expect(r).toEqual({ role: 'CLOSER', perfil: 'ESPECIALISTA' });

    // Tirar a última área é recusado; tirar o Comercial deixa só o Acompanhamento.
    await como('dir', (t) => t`select area_remover_membro('closer', 'COMERCIAL')`);
    expect(await conta('closer')).toMatchObject({ role: 'ACOMPANHAMENTO', p: false, c: false });
    const e = await pgError(
      como('dir', (t) => t`select area_remover_membro('closer', 'ACOMPANHAMENTO')`),
    );
    expect(e.code).toBe('22023');
    await como('dir', (t) => t`select area_definir_membro('closer', 'COMERCIAL', 'CLOSER', false)`);
    await como('dir', (t) => t`select area_remover_membro('closer', 'ACOMPANHAMENTO')`);
    expect(await conta('closer')).toMatchObject({ role: 'CLOSER', p: false, c: true });
  });

  it('area_definir_mestre: dá e tira a Diretoria, nunca a própria', async () => {
    await como('dir', (t) => t`select area_definir_mestre('head2', true)`);
    expect(await conta('head2')).toMatchObject({ role: 'DIRETOR', mestre: true });
    expect(await vinculos('head2')).toEqual([]);
    expect(
      (await pgError(como('dir', (t) => t`select area_definir_mestre('head2', false)`))).code,
    ).toBe('22023');
    await como('dir', (t) => t`select area_definir_mestre('head2', false, 'COMERCIAL', 'HEAD')`);
    expect(await conta('head2')).toMatchObject({ role: 'HEAD', mestre: false });
    expect(await vinculos('head2')).toEqual([{ area: 'COMERCIAL', cargo: 'HEAD', head: true }]);
    expect(
      (
        await pgError(
          como('dir', (t) => t`select area_definir_mestre('dir', false, 'COMERCIAL', 'SDR')`),
        )
      ).code,
    ).toBe('42501');
  });

  it('area_gerencia: a Diretoria, todas; o Head do Comercial, só SDR e Closer', async () => {
    const pode = async (ator: string, alvo: string) =>
      (await como(ator, (t) => t<{ ok: boolean }[]>`select area_gerencia(${alvo}) as ok`))[0]!.ok;
    expect(await pode('dir', 'head')).toBe(true);
    expect(await pode('dir', 'acomp')).toBe(true);
    expect(await pode('head', 'sdr')).toBe(true);
    expect(await pode('head', 'head2')).toBe(false);
    expect(await pode('head', 'acomp')).toBe(false);
    expect(await pode('head', 'dir')).toBe(false);
    expect(await pode('admin', 'acomp')).toBe(false);
    expect(await pode('sdr', 'sdr2')).toBe(false);
  });
});

describe('invariantes (conferidas no commit)', () => {
  it('ao menos uma Diretoria ativa: não tira nem desativa a última', async () => {
    const mestres = await owner<{ id: string }[]>`select id from "user" where mestre and active`;
    expect(mestres.map((m) => m.id)).toEqual(['dir']);
    expect((await pgError(owner`update "user" set active = false where id = 'dir'`)).code).toBe(
      '23514',
    );
    expect((await pgError(owner`update "user" set role = 'HEAD' where id = 'dir'`)).code).toBe(
      '23514',
    );
    expect(await conta('dir')).toMatchObject({ role: 'DIRETOR', mestre: true });
    // Com outra Diretoria ativa, pode.
    await como('dir', (t) => t`select area_definir_mestre('head2', true)`);
    await como('head2', (t) => t`select area_definir_mestre('dir', false, 'COMERCIAL', 'HEAD')`);
    await como('head2', (t) => t`select area_definir_mestre('dir', true)`);
    await como('dir', (t) => t`select area_definir_mestre('head2', false, 'COMERCIAL', 'HEAD')`);
    expect(await conta('dir')).toMatchObject({ role: 'DIRETOR', mestre: true });
  });

  it('conta ativa que não é Diretoria tem ao menos um vínculo', async () => {
    expect((await pgError(owner`delete from area_membros where user_id = 'sdr'`)).code).toBe(
      '23514',
    );
    expect(await vinculos('sdr')).toHaveLength(1);
  });

  it('apagar a conta (só o dono do banco) leva os vínculos; quem definiu vira nulo', async () => {
    await owner`insert into "user" (id, name, email, role) values ('tmp', 'Tmp', 'tmp@x.test', 'DIRETOR')`;
    await como('tmp', (t) => t`select area_definir_membro('sdr', 'COMERCIAL', 'SDR', false)`);
    await owner`delete from "user" where id = 'tmp'`;
    const [v] = await owner<{ definido_por: string | null }[]>`
      select definido_por from area_membros where user_id = 'sdr'`;
    expect(v!.definido_por).toBeNull();
    await owner`insert into "user" (id, name, email, role, can_prospect) values
      ('tmp2', 'Tmp', 'tmp2@x.test', 'SDR', true)`;
    await owner`delete from "user" where id = 'tmp2'`;
    expect(await vinculos('tmp2')).toEqual([]);
  });
});

describe('teste-guarda', () => {
  // Fora da lista de compatibilidade (sai na fase 5), nenhuma função, política ou visão viva lê
  // "user".role nem a antiga tabela mentoria_perfis: a fonte do cargo é area_membros + user.mestre.
  const COMPATIBILIDADE = [
    'area_sincronizar', // grava o resumo
    'mentoria_perfis_escrita', // escrita do dono do banco na visão
    'user_cargo_compat_antes', // traduz escrita antiga em user.role
    'user_cargo_compat_depois',
  ];
  /** Tira comentários, `app_role()` e as conversões `::role`; sobrou `role` = leitura da coluna. */
  const leCargoAntigo = (texto: string) => {
    const limpo = texto
      .replace(/--[^\n]*/g, '')
      .replace(/app_role\(\)/g, '')
      .replace(/::role\b/g, '');
    return /\brole\b/i.test(limpo) || /\bmentoria_perfis\b/.test(limpo);
  };

  it('nenhuma função viva lê user.role ou mentoria_perfis fora da compatibilidade', async () => {
    const funcoes = await owner<{ proname: string; prosrc: string }[]>`
      select p.proname, p.prosrc from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`;
    expect(funcoes.length).toBeGreaterThan(100);
    const lendo = funcoes
      .filter((f) => leCargoAntigo(f.prosrc))
      .map((f) => f.proname)
      .sort();
    expect(lendo).toEqual([...COMPATIBILIDADE].sort());
  });

  it('nenhuma política nem visão lê user.role ou mentoria_perfis', async () => {
    const politicas = await owner<{ nome: string; texto: string }[]>`
      select tablename || '.' || policyname as nome,
        coalesce(qual, '') || ' ' || coalesce(with_check, '') as texto
      from pg_policies where schemaname = 'public'`;
    expect(politicas.filter((p) => leCargoAntigo(p.texto)).map((p) => p.nome)).toEqual([]);
    const visoes = await owner<{ viewname: string; definition: string }[]>`
      select viewname, definition from pg_views where schemaname = 'public'`;
    expect(visoes.filter((v) => leCargoAntigo(v.definition)).map((v) => v.viewname)).toEqual([]);
  });
});
