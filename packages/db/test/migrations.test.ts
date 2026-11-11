import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { runMigrations } from '../src/migrate.js';
import { closeTestConnections, createEmptyTestDb, ownerSql } from '../src/testing.js';

const DB = 'npac_test_db';

afterAll(async () => {
  await closeTestConnections();
});

describe('migrations', () => {
  it('aplica migrations e cria tabelas', async () => {
    const rows = await ownerSql(
      DB,
    )`select table_name from information_schema.tables where table_schema='public'`;
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        'user',
        'session',
        'account',
        'verification',
        'two_factor',
        'rate_limit',
        'pipeline_stages',
        'leads',
        'meetings',
        'audit_log',
      ]),
    );
  });

  it('npac_app não é dono nem ignora RLS', async () => {
    const [r] = await ownerSql(
      DB,
    )`select rolbypassrls, rolsuper from pg_roles where rolname='npac_app'`;
    expect(r).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('habilita as extensões pgcrypto e pg_trgm', async () => {
    const rows = await ownerSql(DB)`select extname from pg_extension`;
    expect(rows.map((r) => r.extname)).toEqual(expect.arrayContaining(['pgcrypto', 'pg_trgm']));
  });

  it('enum role contém ACOMPANHAMENTO depois do migrate', async () => {
    const rows = await ownerSql(DB)`
      select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'role' order by e.enumsortorder`;
    expect(rows.map((r) => r.enumlabel)).toContain('ACOMPANHAMENTO');
  });
});

describe('journal das migrations', () => {
  // O migrator só aplica migration com `when` maior que o da última aplicada. Um `when` fora
  // de ordem (ex.: branch antiga encaixada depois de outra) seria pulado em silêncio em produção.
  it('idx e `when` crescem juntos, um por um', () => {
    const journal = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url)),
        'utf8',
      ),
    ) as { entries: { idx: number; when: number; tag: string }[] };
    journal.entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      expect(e.tag.startsWith(String(i).padStart(4, '0'))).toBe(true);
      if (i > 0) expect(e.when).toBeGreaterThan(journal.entries[i - 1]!.when);
    });
  });
});

describe('limpeza do módulo antigo', () => {
  /** Aplica só as migrations anteriores à primeira com `tag`, numa cópia da pasta `drizzle`. */
  async function migrarAteAntesDe(url: string, tag: string) {
    const pasta = mkdtempSync(join(tmpdir(), 'npac-migrations-'));
    try {
      cpSync(fileURLToPath(new URL('../drizzle', import.meta.url)), pasta, { recursive: true });
      const arquivo = join(pasta, 'meta', '_journal.json');
      const journal = JSON.parse(readFileSync(arquivo, 'utf8')) as {
        entries: { tag: string }[];
      };
      const v2 = journal.entries.findIndex((e) => e.tag.includes(tag));
      if (v2 >= 0) journal.entries = journal.entries.slice(0, v2);
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

  it('limpeza remove o modelo antigo e enfileira a mídia antiga', async () => {
    const banco = 'npac_test_limpeza';
    const url = await createEmptyTestDb(banco);
    await migrarAteAntesDe(url, 'acompanhamento_v2');
    const owner = ownerSql(banco);
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, chave_objeto)
      values ('FICHA_ANTES', gen_random_uuid(), 'FOTO', 'antiga/1.jpg')`;
    await owner`insert into mentoria_midia (dono_tipo, dono_id, tipo, url_video)
      values ('FICHA_ANTES', gen_random_uuid(), 'LINK_VIDEO', 'https://youtu.be/x')`;

    await runMigrations(url);

    const [tabela] = await owner`select to_regclass('mentoria_mentorados') as t`;
    expect(tabela!.t).toBeNull();
    const [midia] = await owner`select count(*)::int as n from mentoria_midia`;
    expect(midia!.n).toBe(0);
    const fila = await owner`select chave_objeto, removido_em from mentoria_midia_exclusao`;
    expect(fila).toEqual([{ chave_objeto: 'antiga/1.jpg', removido_em: null }]);
    const sobra = await owner`select proname from pg_proc
      where proname in ('mentoria_excluir_registro', 'mentoria_excluir_pessoa', 'mentoria_travar_ficha')`;
    expect(sobra).toEqual([]);
  });

  // Produção chega à 0049 (cargos) com a carteira importada (Parte 2): o plano nasce sem alertar o
  // passado, e quem estava PAUSADO ganha a pausa aberta com o status de antes.
  it('plano e pausas chegam com a carteira que já existe', async () => {
    const banco = 'npac_test_plano_migra';
    const url = await createEmptyTestDb(banco);
    await migrarAteAntesDe(url, 'acompanhamento_v2_plano');
    const owner = ownerSql(banco);
    const hoje = `(now() at time zone 'America/Sao_Paulo')::date`;
    const nova = async (mentoria: string, status: string, inicio: string | null, imp = true) => {
      const [i] = await owner.unsafe<{ id: string }[]>(
        `insert into mentoria_inscricoes (tipo, mentoria, status, importada, inicio_jornada,
           termino_previsto)
         values ('INDIVIDUAL', '${mentoria}', '${status}', ${imp},
           ${inicio ?? 'null'}, ${inicio ? `(${inicio} + interval '12 months')::date` : 'null'})
         returning id`,
      );
      return i!.id;
    };
    const etapas = (id: string, status: string) =>
      owner.unsafe(`insert into mentoria_onboarding_etapas (inscricao_id, etapa, status)
        select '${id}', e, '${status}' from unnest(array['BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO',
          'PME_AQUECIMENTO', 'CAIXA', 'IDR']) e`);
    const m2 = await nova('2M', 'ATIVO', `${hoje} - 100`);
    const rdvSemIdr = await nova('RDV', 'ATIVO', null);
    const pausadoOnb = await nova('RDV', 'PAUSADO', null, false);
    await etapas(pausadoOnb, 'PENDENTE');
    const pausadoAtivo = await nova('6M', 'PAUSADO', `${hoje} - 40`);
    await etapas(pausadoAtivo, 'ANTERIOR_AO_SISTEMA');

    await runMigrations(url);

    const contar = async (id: string) =>
      (
        await owner<{ total: number; alertam: number; passadas: number }[]>`
          select count(*)::int as total,
            (count(*) filter (where mentoria_acao_atrasada(status, anterior_ao_sistema,
              data_limite, (now() at time zone 'America/Sao_Paulo')::date)))::int as alertam,
            (count(*) filter (where data_prevista < (now() at time zone 'America/Sao_Paulo')::date
              and not anterior_ao_sistema))::int as passadas
          from mentoria_acoes where inscricao_id = ${id}`
      )[0]!;
    expect(await contar(m2)).toEqual({ total: 8, alertam: 0, passadas: 0 });
    expect((await contar(rdvSemIdr)).total).toBe(0);
    expect((await contar(pausadoAtivo)).alertam).toBe(0);
    const [modelo] = await owner`select count(*)::int as n from mentoria_plano_modelo`;
    expect(modelo!.n).toBe(43);
    const pausas = await owner<{ inscricao_id: string; status_anterior: string; fim: null }[]>`
      select inscricao_id, status_anterior, fim from mentoria_pausas order by status_anterior`;
    expect(pausas).toEqual([
      { inscricao_id: pausadoAtivo, status_anterior: 'ATIVO', fim: null },
      { inscricao_id: pausadoOnb, status_anterior: 'ONBOARDING', fim: null },
    ]);
  });
});
