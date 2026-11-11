import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbClient } from '../src/client.js';
import { seedMentoria } from '../src/seed-mentoria.js';
import { seed } from '../src/seed.js';
import { closeTestConnections, ownerSql } from '../src/testing.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
let client: DbClient;

const limpar = () =>
  owner`truncate mentoria_inscricoes, mentoria_perfis, meetings, leads, pipeline_stages, audit_log, "user" restart identity cascade`;

beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  url.pathname = `/${DB}`;
  client = createDb(url.toString(), { max: 2 });
  await limpar();
  await seed(client.db, {
    hashPassword: async (p) => `hashed:${p}`,
    initialPassword: 'senha-inicial-123',
  });
  await seedMentoria(client.db);
  await seedMentoria(client.db);
});

afterAll(async () => {
  await limpar();
  await client.close();
  await closeTestConnections();
});

describe('seedMentoria', () => {
  it('cria as contas do módulo com o cargo Acompanhamento e a senha de carla', async () => {
    const rows = await owner<{ username: string; role: string; password: string }[]>`
      select u.username, u.role, a.password from "user" u
      join account a on a.user_id = u.id and a.provider_id = 'credential'
      where u.username in ('duda', 'operacao', 'manu', 'leo') order by u.username`;
    expect(rows.map((r) => r.username)).toEqual(['duda', 'leo', 'manu', 'operacao']);
    for (const r of rows) {
      expect(r.role).toBe('ACOMPANHAMENTO');
      expect(r.password).toBe('hashed:senha-inicial-123');
    }
  });

  it('define os perfis e deixa carla sem perfil', async () => {
    const rows = await owner<{ username: string; perfil: string; admin: boolean }[]>`
      select u.username, p.perfil, p.admin from mentoria_perfis p
      join "user" u on u.id = p.user_id order by u.username`;
    expect(rows).toEqual([
      { username: 'duda', perfil: 'ACOMPANHAMENTO', admin: true },
      { username: 'leo', perfil: 'MENTOR', admin: false },
      { username: 'manu', perfil: 'ESPECIALISTA', admin: false },
      { username: 'operacao', perfil: 'OPERACAO', admin: false },
    ]);
  });

  it('traz individual, casal e importada, sem duplicar no segundo seed', async () => {
    const [q] = await owner<{ total: number; casal: number; importada: number; pessoas: number }[]>`
      select count(*)::int as total,
        (count(*) filter (where tipo = 'CASAL'))::int as casal,
        (count(*) filter (where importada))::int as importada,
        (select count(*)::int from mentoria_pessoas) as pessoas
      from mentoria_inscricoes`;
    expect(q!.total).toBe(14);
    expect(q!.casal).toBe(4);
    expect(q!.importada).toBe(1);
    expect(q!.pessoas).toBe(18);
  });

  it('cria as 6 etapas de todas, com exemplos em cada etapa do funil', async () => {
    const [q] = await owner<{ etapas: number; inscricoes: number }[]>`
      select count(*)::int as etapas, count(distinct inscricao_id)::int as inscricoes
      from mentoria_onboarding_etapas`;
    expect(q!.etapas).toBe(q!.inscricoes * 6);
    expect(q!.inscricoes).toBe(14);
    const fora = await owner<{ n: number }[]>`
      select count(*)::int as n from mentoria_inscricoes i
      where i.status <> 'ONBOARDING' and exists (
        select 1 from mentoria_onboarding_etapas e
        where e.inscricao_id = i.id and e.status <> 'ANTERIOR_AO_SISTEMA')`;
    expect(fora[0]!.n).toBe(0);
    const caixas = await owner<{ status: string }[]>`
      select status from mentoria_envios_fisicos order by status`;
    expect(caixas.map((c) => c.status)).toEqual(['ENTREGUE', 'ENVIADO']);
  });

  it('só usa nomes fictícios', async () => {
    const rows = await owner<{ nome: string }[]>`select nome from mentoria_pessoas`;
    for (const r of rows) expect(r.nome).toMatch(/^Mentorad[oa] Fictíci[oa] \d\d$/);
  });
});
