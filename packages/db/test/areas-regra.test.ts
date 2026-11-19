// Acesso por área, Fase 2 (NPAC-54): a regra única de quem gerencia quem. O mesmo arquivo de casos da
// função pura (packages/shared/test/areas-casos.ts) roda aqui contra a gêmea em SQL (`area_regra`):
// mesmo veredito e mesmo motivo. Depois, as funções que escrevem o cargo aplicam essa regra com quem
// está logado. Banco próprio: troca cargos à vontade.
import postgres from 'postgres';
import { podeGerenciar, type PedidoRegra } from '@npac/shared/areas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appSql, closeTestConnections, ownerSql, resetTestDb } from '../src/testing.js';
import { CASOS } from '../../shared/test/areas-casos.js';

const BANCO = 'npac_test_areas_regra';
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

const como = <T>(id: string, fn: (t: postgres.TransactionSql) => Promise<T>) =>
  app.begin(async (t) => {
    await t`select set_config('app.user_id', ${id}, true)`;
    return fn(t);
  }) as Promise<T>;

const vinculos = async (id: string) =>
  owner<{ area: string; cargo: string | null; head: boolean }[]>`
    select area, cargo, head from area_membros where user_id = ${id} order by area`;

/** Veredito do SQL no formato da função pura. */
const sqlVeredito = async (p: PedidoRegra) => {
  const [r] = await owner<{ v: string }[]>`
    select area_regra(${JSON.stringify(p.ator)}::text::jsonb,
      ${p.alvo ? JSON.stringify(p.alvo) : null}::text::jsonb, ${p.proprio ?? false}, ${p.acao},
      ${p.area ?? null}, ${p.cargo ?? null}, ${p.head ?? false}, ${p.mestre ?? false},
      ${p.pedidoArea ?? null}) as v`;
  const [erro, motivo] = r!.v.split('|');
  return erro === 'OK' ? { ok: true } : { ok: false, erro, motivo };
};

beforeAll(async () => {
  await resetTestDb(BANCO);
  await owner`insert into "user" (id, name, email, role, can_prospect, can_close) values
    ('dir', 'Dir', 'dir@x.test', 'DIRETOR', false, false),
    ('head', 'Head', 'head@x.test', 'HEAD', true, false),
    ('head2', 'Head 2', 'head2@x.test', 'HEAD', false, true),
    ('sdr', 'SDR', 'sdr@x.test', 'SDR', true, false),
    ('closer', 'Closer', 'closer@x.test', 'CLOSER', false, true),
    ('admin', 'Admin', 'admin@x.test', 'ACOMPANHAMENTO', false, false),
    ('admin2', 'Admin 2', 'admin2@x.test', 'ACOMPANHAMENTO', false, false),
    ('op', 'Op', 'op@x.test', 'ACOMPANHAMENTO', false, false),
    ('semperfil', 'Sem perfil', 'semperfil@x.test', 'ACOMPANHAMENTO', false, false)`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values
    ('admin', 'ACOMPANHAMENTO', true), ('admin2', 'ACOMPANHAMENTO', true),
    ('op', 'OPERACAO', false)`;
}, 120_000);

afterAll(closeTestConnections);

describe('gêmea em SQL: o mesmo arquivo de casos da função pura', () => {
  it('tem casos para rodar', () => expect(CASOS.length).toBeGreaterThan(80));

  it.each(CASOS.map((c) => [c.nome, c] as const))('%s', async (_, c) => {
    const ts = podeGerenciar(c.pedido);
    const sql = await sqlVeredito(c.pedido);
    expect(sql).toEqual(ts);
    expect(ts.ok ? 'OK' : ts.erro).toBe(c.esperado);
  });
});

describe('funções que escrevem o cargo aplicam a regra com quem está logado', () => {
  it('Admin do módulo troca o perfil de quem é da área, sem o selo', async () => {
    await como(
      'admin',
      (t) => t`select area_definir_membro('op', 'ACOMPANHAMENTO', 'MENTOR', false)`,
    );
    expect(await vinculos('op')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'MENTOR', head: false },
    ]);
    await como('admin', (t) => t`select mentoria_definir_perfil('op', 'OPERACAO', false)`);
    expect(await vinculos('op')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: false },
    ]);
  });

  it('Admin do módulo não dá nem tira o selo de outro (achado fechado)', async () => {
    const dar = await pgError(
      como('admin', (t) => t`select area_definir_membro('op', 'ACOMPANHAMENTO', 'OPERACAO', true)`),
    );
    expect(dar).toMatchObject({
      code: '42501',
      message: 'Só a Diretoria dá o selo de Admin do Acompanhamento',
    });
    const pelaAntiga = await pgError(
      como('admin', (t) => t`select mentoria_definir_perfil('op', 'OPERACAO', true)`),
    );
    expect(pelaAntiga.code).toBe('42501');
    const tirar = await pgError(
      como(
        'admin',
        (t) => t`select area_definir_membro('admin2', 'ACOMPANHAMENTO', 'ACOMPANHAMENTO', false)`,
      ),
    );
    expect(tirar).toMatchObject({
      code: '42501',
      message: 'Só a Diretoria administra contas de Admin do Acompanhamento',
    });
    expect(await vinculos('op')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: false },
    ]);
    expect(await vinculos('admin2')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'ACOMPANHAMENTO', head: true },
    ]);
  });

  it('ninguém mexe no próprio cargo, nem a Diretoria', async () => {
    const proprio = await pgError(
      como(
        'admin',
        (t) => t`select area_definir_membro('admin', 'ACOMPANHAMENTO', 'OPERACAO', true)`,
      ),
    );
    expect(proprio).toMatchObject({
      code: '42501',
      message: 'Você não pode remover o próprio cargo',
    });
    expect(
      (
        await pgError(
          como('dir', (t) => t`select area_definir_mestre('dir', false, 'COMERCIAL', 'SDR')`),
        )
      ).code,
    ).toBe('42501');
  });

  it('a Diretoria dá e tira o selo', async () => {
    await como(
      'dir',
      (t) => t`select area_definir_membro('op', 'ACOMPANHAMENTO', 'OPERACAO', true)`,
    );
    expect(await vinculos('op')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: true },
    ]);
    await como(
      'dir',
      (t) => t`select area_definir_membro('op', 'ACOMPANHAMENTO', 'OPERACAO', false)`,
    );
    expect(await vinculos('op')).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: false },
    ]);
  });

  it('Head do Comercial não alcança o Acompanhamento nem outro Head', async () => {
    for (const q of [
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('op', 'ACOMPANHAMENTO', 'MENTOR', false)`,
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('sdr', 'ACOMPANHAMENTO', 'MENTOR', false)`,
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('head2', 'COMERCIAL', 'SDR', false)`,
      (t: postgres.TransactionSql) =>
        t`select area_definir_membro('sdr', 'COMERCIAL', 'HEAD', true)`,
      (t: postgres.TransactionSql) => t`select area_remover_membro('sdr', 'COMERCIAL')`,
      (t: postgres.TransactionSql) => t`select area_definir_mestre('sdr', true)`,
    ])
      expect((await pgError(como('head', q))).code).toBe('42501');
    await como('head', (t) => t`select area_definir_membro('sdr', 'COMERCIAL', 'CLOSER', false)`);
    await como('head', (t) => t`select area_definir_membro('sdr', 'COMERCIAL', 'SDR', false)`);
    expect(await vinculos('sdr')).toEqual([{ area: 'COMERCIAL', cargo: 'SDR', head: false }]);
  });

  it('conta em duas áreas: o Head troca só o cargo da área dele e não mexe na conta', async () => {
    await como(
      'dir',
      (t) => t`select area_definir_membro('closer', 'ACOMPANHAMENTO', 'ESPECIALISTA', false)`,
    );
    await como(
      'admin',
      (t) => t`select area_definir_membro('closer', 'ACOMPANHAMENTO', 'MENTOR', false)`,
    );
    expect(
      (
        await pgError(
          como('admin', (t) => t`select area_definir_membro('closer', 'COMERCIAL', 'SDR', false)`),
        )
      ).code,
    ).toBe('42501');
    const gerencia = async (ator: string, alvo: string) =>
      (await como(ator, (t) => t<{ ok: boolean }[]>`select area_gerencia(${alvo}) as ok`))[0]!.ok;
    expect(await gerencia('admin', 'closer')).toBe(false);
    expect(await gerencia('head', 'closer')).toBe(false);
    expect(await gerencia('dir', 'closer')).toBe(true);
    await como('dir', (t) => t`select area_remover_membro('closer', 'ACOMPANHAMENTO')`);
    expect(await gerencia('head', 'closer')).toBe(true);
  });

  it('area_gerencia segue a regra (ação CONTA); push_purge_user usa ela', async () => {
    const gerencia = async (ator: string, alvo: string) =>
      (await como(ator, (t) => t<{ ok: boolean }[]>`select area_gerencia(${alvo}) as ok`))[0]!.ok;
    expect(await gerencia('admin', 'op')).toBe(true);
    expect(await gerencia('admin', 'semperfil')).toBe(true);
    expect(await gerencia('admin', 'admin2')).toBe(false);
    expect(await gerencia('admin', 'sdr')).toBe(false);
    expect(await gerencia('head', 'sdr')).toBe(true);
    expect(await gerencia('head', 'op')).toBe(false);
    expect(await gerencia('op', 'semperfil')).toBe(false);
    expect(await gerencia('dir', 'nao-existe')).toBe(false);
    await como('admin', (t) => t`select push_purge_user('op')`);
    expect(
      (await pgError(como('op', (t) => t`select push_purge_user('semperfil')`))).message,
    ).toMatch(/sem permissão/);
  });

  it('area_contas só responde à Diretoria e aos Heads', async () => {
    const n = async (ator: string) =>
      (
        await como(ator, (t) => t<{ n: number }[]>`select count(*)::int as n from area_contas()`)
      )[0]!.n;
    expect(await n('dir')).toBe(9);
    expect(await n('admin')).toBe(9);
    expect(await n('head')).toBe(9);
    expect(await n('op')).toBe(0);
    expect(await n('sdr')).toBe(0);
    const [d] = await como(
      'dir',
      (t) => t<{ areas: unknown; mestre: boolean }[]>`
      select areas, mestre from area_contas() where user_id = 'dir'`,
    );
    expect(d).toEqual({ areas: [], mestre: true });
  });
});
