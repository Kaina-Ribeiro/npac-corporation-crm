import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbClient } from '../src/client.js';
import { seedMentoria } from '../src/seed-mentoria.js';
import { seed } from '../src/seed.js';
import { closeTestConnections, ownerSql } from '../src/testing.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
let client: DbClient;

const opts = {
  hashPassword: async (p: string) => `hashed:${p}`,
  initialPassword: 'senha-inicial-123',
};

beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  url.pathname = `/${DB}`;
  client = createDb(url.toString(), { max: 2 });
  await owner`truncate meetings, form_responses, leads, pipeline_stages, audit_log, "user" restart identity cascade`;
  await seed(client.db, opts);
});

afterAll(async () => {
  await owner`truncate mentoria_mentorados cascade`;
  await client.close();
  await closeTestConnections();
});

describe('seed do acompanhamento', () => {
  it('seed cria a Carla com papel ACOMPANHAMENTO', async () => {
    const [c] = await owner<{ role: string; can_prospect: boolean; can_close: boolean }[]>`
      select role, can_prospect, can_close from "user" where email = 'carla@npac.com.br'`;
    expect(c).toEqual({ role: 'ACOMPANHAMENTO', can_prospect: false, can_close: false });
  });

  it('seedMentoria é idempotente (duas execuções, mesma contagem)', async () => {
    await seedMentoria(client.db);
    const [a] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_mentorados`;
    await seedMentoria(client.db);
    const [b] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_mentorados`;
    expect(a?.n).toBe(16);
    expect(b?.n).toBe(16);
  });

  it('todos os nomes do seed começam com "Mentorado Fictício"', async () => {
    const rows = await owner<{ nome: string }[]>`select nome from mentoria_mentorados`;
    expect(rows.length).toBe(16);
    for (const r of rows) expect(r.nome.startsWith('Mentorado Fictício')).toBe(true);
  });
});
