// Acesso por área, Fase 1 (NPAC-54, plano docs/plans/acesso-por-area.md): `area_membros` vira a fonte
// do cargo e as funções que leem o cargo passam a ler dela. Para quem já usa o sistema nada muda:
//   1. antes × depois: num banco na 0071 (antes da migration), com as contas do seed e casos de borda,
//      grava o resultado das funções de hoje; aplica a migration; as funções vivas dão o mesmo, conta
//      por conta;
//   2. hoje × viva: depois da migration, as funções da 0021/0045/0053 (recriadas com outro nome a partir
//      do texto das migrations, lendo o resumo `user.role` e a visão `mentoria_perfis`) e as vivas
//      continuam iguais depois de trocas de cargo pelos dois caminhos (função nova e escrita antiga).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate.js';
import { appSql, closeTestConnections, createEmptyTestDb, ownerSql } from '../src/testing.js';

const BANCO = 'npac_test_areas';
const owner = ownerSql(BANCO);
const app = appSql(BANCO);

type Conta = {
  id: string;
  role: 'DIRETOR' | 'HEAD' | 'SDR' | 'CLOSER' | 'ACOMPANHAMENTO';
  p: boolean;
  c: boolean;
  ativo?: boolean;
  perfil?: string;
  admin?: boolean;
};

/** As contas do seed (`seed.ts` + `seed-mentoria.ts`) e casos de borda. */
const CONTAS: Conta[] = [
  { id: 'diretor', role: 'DIRETOR', p: false, c: false },
  { id: 'ana', role: 'HEAD', p: true, c: false },
  { id: 'ronaldo', role: 'HEAD', p: false, c: true },
  { id: 'ale', role: 'SDR', p: true, c: false },
  { id: 'murilo', role: 'SDR', p: true, c: false },
  { id: 'igor', role: 'SDR', p: true, c: false },
  { id: 'sonia', role: 'CLOSER', p: false, c: true },
  { id: 'carla', role: 'ACOMPANHAMENTO', p: false, c: false },
  { id: 'duda', role: 'ACOMPANHAMENTO', p: false, c: false, perfil: 'ACOMPANHAMENTO', admin: true },
  { id: 'operacao', role: 'ACOMPANHAMENTO', p: false, c: false, perfil: 'OPERACAO' },
  { id: 'manu', role: 'ACOMPANHAMENTO', p: false, c: false, perfil: 'ESPECIALISTA' },
  { id: 'leo', role: 'ACOMPANHAMENTO', p: false, c: false, perfil: 'MENTOR' },
  // Desativadas: continuam com vínculo (a ficha mostra quem saiu), mas as funções não as veem.
  {
    id: 'acomp-inativa',
    role: 'ACOMPANHAMENTO',
    p: false,
    c: false,
    ativo: false,
    perfil: 'ACOMPANHAMENTO',
    admin: true,
  },
  { id: 'sdr-inativo', role: 'SDR', p: true, c: false, ativo: false },
  { id: 'diretor-inativo', role: 'DIRETOR', p: true, c: true, ativo: false },
  { id: 'head-inativo', role: 'HEAD', p: true, c: true, ativo: false },
  // Perfil esquecido numa conta que não é do Acompanhamento: as funções de hoje já o ignoram.
  { id: 'sdr-com-perfil', role: 'SDR', p: true, c: false, perfil: 'OPERACAO', admin: true },
];
const IDS = CONTAS.map((c) => c.id);
/** Quem está "logado" ao chamar as funções: cada conta, um id que não existe e ninguém. */
const ATORES: (string | null)[] = [...IDS, 'nao-existe', null];
const PERFIS = ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR'];

/** Aplica só as migrations anteriores à primeira com `tag`, numa cópia da pasta `drizzle`. */
async function migrarAteAntesDe(url: string, tag: string) {
  const pasta = mkdtempSync(join(tmpdir(), 'npac-migrations-'));
  try {
    cpSync(fileURLToPath(new URL('../drizzle', import.meta.url)), pasta, { recursive: true });
    const arquivo = join(pasta, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(arquivo, 'utf8')) as { entries: { tag: string }[] };
    const i = journal.entries.findIndex((e) => e.tag.includes(tag));
    if (i >= 0) journal.entries = journal.entries.slice(0, i);
    writeFileSync(arquivo, JSON.stringify(journal));
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(sql), { migrationsFolder: pasta });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

type Foto = Record<string, unknown>;

/**
 * O que as funções respondem, com o sufixo `sfx` no nome (`''` = as vivas, `_hoje` = as de hoje).
 * Roda como owner com `app.user_id` definido: as funções são SECURITY DEFINER, o resultado é o mesmo
 * que a API vê.
 */
async function fotografar(s: Sql, sfx = ''): Promise<Foto> {
  const foto: Foto = {};
  for (const ator of ATORES) {
    const r = await s.begin(async (t) => {
      await t`select set_config('app.user_id', ${ator ?? ''}, true)`;
      const [x] = await t.unsafe<{ role: string | null; perfil: string | null; admin: boolean }[]>(
        `select app_role${sfx}()::text as role, mentoria_perfil${sfx}() as perfil,
           mentoria_admin${sfx}() as admin`,
      );
      return x;
    });
    foto[`ator:${ator}`] = r;
  }
  for (const id of IDS) {
    const [x] = await s.unsafe<{ p: string | null }[]>(`select mentoria_perfil_de${sfx}($1) as p`, [
      id,
    ]);
    foto[`perfil_de:${id}`] = x!.p;
  }
  return foto;
}

/** Destinatários do push da Fila (0055) por perfil e responsável: só as vivas (não há "_hoje"). */
async function destinatarios(s: Sql): Promise<Foto> {
  const foto: Foto = {};
  for (const perfil of PERFIS)
    for (const alvo of [...IDS, null]) {
      const [x] = await s<{ ids: string[] }[]>`
        select mentoria_destinatarios(${perfil}, ${alvo}) as ids`;
      foto[`${perfil}:${alvo}`] = x!.ids;
    }
  return foto;
}

/** `mentoria_perfis` lida como npac_app (RLS), por quem está logado. */
async function perfisVistos(): Promise<Foto> {
  const foto: Foto = {};
  for (const ator of ATORES) {
    foto[`${ator}`] = await app.begin(async (t) => {
      await t`select set_config('app.user_id', ${ator ?? ''}, true)`;
      return [
        ...(await t<{ user_id: string; perfil: string; admin: boolean }[]>`
          select user_id, perfil, admin from mentoria_perfis order by user_id`),
      ];
    });
  }
  return foto;
}

/** As funções de hoje, a partir do texto das migrations, com o sufixo `_hoje`. */
function funcoesDeHoje(): string[] {
  const ler = (arquivo: string) =>
    readFileSync(new URL(`../drizzle/${arquivo}`, import.meta.url), 'utf8');
  const extrair = (texto: string, nome: string) => {
    const m = texto.match(
      new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${nome}\\(([^)]*)\\)[\\s\\S]*?\\$\\$;`),
    );
    if (!m) throw new Error(`função ${nome} não encontrada`);
    return m[0]
      .replace(
        /^CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+)\(/,
        'CREATE OR REPLACE FUNCTION $1_hoje(',
      )
      .replace(/;$/, '');
  };
  return [
    extrair(ler('0021_diretoria.sql'), 'app_role'),
    extrair(ler('0045_acompanhamento_v2_base.sql'), 'mentoria_perfil'),
    extrair(ler('0045_acompanhamento_v2_base.sql'), 'mentoria_admin'),
    extrair(ler('0053_acompanhamento_v2_fila.sql'), 'mentoria_perfil_de'),
  ];
}

let antes: Foto;
let depois: Foto;
let destAntes: Foto;
let destDepois: Foto;
let vistosAntes: Foto;
let vistosDepois: Foto;

beforeAll(async () => {
  const url = await createEmptyTestDb(BANCO);
  await migrarAteAntesDe(url, 'area_membros');
  for (const c of CONTAS) {
    await owner`insert into "user" (id, name, email, role, can_prospect, can_close, active)
      values (${c.id}, ${c.id}, ${`${c.id}@areas.test`}, ${c.role}, ${c.p}, ${c.c},
        ${c.ativo ?? true})`;
    if (c.perfil)
      await owner`insert into mentoria_perfis (user_id, perfil, admin)
        values (${c.id}, ${c.perfil}, ${c.admin ?? false})`;
  }
  antes = await fotografar(owner);
  destAntes = await destinatarios(owner);
  vistosAntes = await perfisVistos();

  await runMigrations(url);

  depois = await fotografar(owner);
  destDepois = await destinatarios(owner);
  vistosDepois = await perfisVistos();
  for (const f of funcoesDeHoje()) await owner.unsafe(f);
}, 120_000);

afterAll(closeTestConnections);

describe('antes × depois da migration (mesmo banco, mesmas contas)', () => {
  it('app_role, mentoria_perfil, mentoria_admin e mentoria_perfil_de: iguais conta por conta', () => {
    expect(Object.keys(antes)).toHaveLength(ATORES.length + IDS.length);
    expect(depois).toEqual(antes);
  });

  it('destinatários do push da Fila: iguais', () => {
    expect(destDepois).toEqual(destAntes);
  });

  it('mentoria_perfis lida pela RLS: igual, menos o perfil esquecido de quem não é do Acompanhamento', () => {
    const semEsquecido = (f: Foto) =>
      Object.fromEntries(
        Object.entries(f).map(([k, v]) => [
          k,
          (v as { user_id: string }[]).filter((r) => r.user_id !== 'sdr-com-perfil'),
        ]),
      );
    expect(semEsquecido(vistosDepois)).toEqual(semEsquecido(vistosAntes));
    // O perfil esquecido já não valia (mentoria_perfil_de = null antes e depois) e não vira vínculo.
    expect(antes['perfil_de:sdr-com-perfil']).toBeNull();
    expect(Object.values(vistosDepois).flat()).not.toContainEqual(
      expect.objectContaining({ user_id: 'sdr-com-perfil' }),
    );
  });

  it('carga inicial: um vínculo por conta que não é Diretoria, Diretoria = mestre sem vínculo', async () => {
    const vinculos = await owner<
      { user_id: string; area: string; cargo: string | null; head: boolean }[]
    >`
      select user_id, area, cargo, head from area_membros order by user_id`;
    const esperado = CONTAS.filter((c) => c.role !== 'DIRETOR')
      .map((c) =>
        c.role === 'ACOMPANHAMENTO'
          ? { user_id: c.id, area: 'ACOMPANHAMENTO', cargo: c.perfil ?? null, head: !!c.admin }
          : { user_id: c.id, area: 'COMERCIAL', cargo: c.role, head: c.role === 'HEAD' },
      )
      .sort((a, b) => a.user_id.localeCompare(b.user_id));
    expect(vinculos).toEqual(esperado);
    const mestres = await owner<{ id: string }[]>`select id from "user" where mestre order by id`;
    expect(mestres.map((m) => m.id)).toEqual(['diretor', 'diretor-inativo']);
    // O resumo não mudou para ninguém.
    const roles = await owner<{ id: string; role: string }[]>`select id, role::text from "user"`;
    for (const c of CONTAS) expect(roles.find((r) => r.id === c.id)?.role).toBe(c.role);
  });
});

describe('hoje × viva, depois de trocas de cargo', () => {
  const comoDiretor = <T>(fn: (t: postgres.TransactionSql) => Promise<T>) =>
    owner.begin(async (t) => {
      await t`select set_config('app.user_id', 'diretor', true)`;
      return fn(t);
    });

  it('as funções de hoje e as vivas continuam iguais em cada passo', async () => {
    const passos: [string, () => Promise<unknown>][] = [
      [
        'sdr vira closer (escrita antiga)',
        () =>
          owner`update "user" set role = 'CLOSER', can_prospect = false, can_close = true where id = 'ale'`,
      ],
      [
        'sdr vira acompanhamento sem perfil (escrita antiga)',
        () =>
          owner`update "user" set role = 'ACOMPANHAMENTO', can_prospect = false, can_close = false where id = 'murilo'`,
      ],
      [
        'perfil pela função antiga',
        () =>
          comoDiretor((t) => t`select mentoria_definir_perfil('murilo', 'ESPECIALISTA', false)`),
      ],
      [
        'selo de admin pela função antiga',
        () => comoDiretor((t) => t`select mentoria_definir_perfil('operacao', 'OPERACAO', true)`),
      ],
      [
        'tira o perfil pela função antiga',
        () => comoDiretor((t) => t`select mentoria_definir_perfil('manu', null, false)`),
      ],
      [
        'closer vira head pela função nova',
        () => comoDiretor((t) => t`select area_definir_membro('sonia', 'COMERCIAL', 'HEAD', true)`),
      ],
      [
        'acompanhamento troca de perfil pela função nova',
        () =>
          comoDiretor(
            (t) => t`select area_definir_membro('leo', 'ACOMPANHAMENTO', 'OPERACAO', false)`,
          ),
      ],
      [
        'head vira diretoria pela função nova',
        () => comoDiretor((t) => t`select area_definir_mestre('ronaldo', true)`),
      ],
      [
        'diretoria volta a sdr pela função nova',
        () =>
          comoDiretor((t) => t`select area_definir_mestre('ronaldo', false, 'COMERCIAL', 'SDR')`),
      ],
      [
        'acompanhamento vira diretoria (escrita antiga)',
        () => owner`update "user" set role = 'DIRETOR' where id = 'carla'`,
      ],
      [
        'desativa a admin do módulo',
        () => owner`update "user" set active = false where id = 'duda'`,
      ],
    ];
    for (const [nome, passo] of passos) {
      await passo();
      const viva = await fotografar(owner);
      const hoje = await fotografar(owner, '_hoje');
      expect(viva, nome).toEqual(hoje);
    }
  });
});
