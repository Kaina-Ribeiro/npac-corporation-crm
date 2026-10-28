import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbClient } from '../src/client.js';
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
  await owner`truncate meetings, leads, pipeline_stages, audit_log, "user" restart identity cascade`;
  await seed(client.db, opts);
  await seed(client.db, opts);
});

afterAll(async () => {
  await client.close();
  await closeTestConnections();
});

describe('seed', () => {
  it('produtos reais por closer, sem duplicar no segundo seed', async () => {
    const rows = await owner<
      { price_cents: number; can_close: boolean }[]
    >`select p.price_cents, u.can_close from products p join "user" u on u.id=p.closer_id order by p.price_cents`;
    expect(rows.map((r) => r.price_cents)).toEqual([
      250000, 300000, 350000, 1800000, 3000000, 8000000,
    ]);
    expect(rows.every((r) => r.can_close)).toBe(true);
  });
  it('é idempotente: 6 usuários e 8 etapas', async () => {
    const [u] = await owner<{ n: number }[]>`select count(*)::int as n from "user"`;
    const [s] = await owner<{ n: number }[]>`select count(*)::int as n from pipeline_stages`;
    expect(u?.n).toBe(6);
    expect(s?.n).toBe(8);
  });

  it('etapas na ordem da spec, posições 1..8', async () => {
    const rows = await owner<{ key: string; label: string; position: number }[]>`
      select key, label, position from pipeline_stages order by position`;
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.map((r) => r.key)).toEqual([
      'SONDAGEM',
      'AGENDADO_DIRETO',
      'EM_FOLLOW',
      'AGENDADO_FOLLOW',
      'AGENDOU_PAGAMENTO',
      'NO_SHOW',
      'VENDA',
      'PERDIDO',
    ]);
    expect(rows[0]?.label).toBe('Criando Relacionamento');
    expect(rows[6]?.label).toBe('Venda Fechada 🏆');
  });

  it('papéis e flags pelo dado, não pelo nome', async () => {
    const rows = await owner<
      { email: string; role: string; can_prospect: boolean; can_close: boolean }[]
    >`select email, role, can_prospect, can_close from "user"`;
    const by = Object.fromEntries(rows.map((r) => [r.email, r]));
    expect(by['ana@npac.com.br']).toMatchObject({
      role: 'HEAD',
      can_prospect: true,
      can_close: false,
    });
    expect(by['ronaldo@npac.com.br']).toMatchObject({ role: 'HEAD', can_close: true });
    expect(by['sonia@npac.com.br']).toMatchObject({
      role: 'CLOSER',
      can_close: true,
      can_prospect: false,
    });
    for (const sdr of ['ale', 'murilo', 'igor']) {
      expect(by[`${sdr}@npac.com.br`]).toMatchObject({ role: 'SDR', can_prospect: true });
    }
  });

  it('cada usuário tem uma conta credential com o hash e troca obrigatória', async () => {
    const rows = await owner<{ n: number; pw: string | null; must: boolean }[]>`
      select count(a.id)::int as n, min(a.password) as pw, bool_and(u.must_change_password) as must
      from "user" u left join account a on a.user_id = u.id and a.provider_id = 'credential'
      group by u.id`;
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.n).toBe(1);
      expect(r.pw).toBe('hashed:senha-inicial-123');
      expect(r.must).toBe(true);
    }
  });

  it('recusa senha inicial com menos de 12 caracteres', async () => {
    await expect(seed(client.db, { ...opts, initialPassword: '12345678' })).rejects.toThrow(/12/);
  });
});
