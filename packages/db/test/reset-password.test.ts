import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbClient } from '../src/client.js';
import { resetPassword } from '../src/reset-password.js';
import { seed } from '../src/seed.js';
import { closeTestConnections, ownerSql } from '../src/testing.js';

const DB = 'npac_test_db';
const owner = ownerSql(DB);
let client: DbClient;
const hashPassword = async (p: string) => `hashed:${p}`;

beforeAll(async () => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  url.pathname = `/${DB}`;
  client = createDb(url.toString(), { max: 2 });
  await owner`truncate meetings, leads, pipeline_stages, audit_log, "user" restart identity cascade`;
  await seed(client.db, { hashPassword, initialPassword: 'inicial' });
  await owner`update "user" set must_change_password = false, two_factor_enabled = true where username = 'diretor'`;
  const [u] = await owner<{ id: string }[]>`select id from "user" where username = 'diretor'`;
  await owner`insert into two_factor (id, secret, backup_codes, user_id) values ('tf1', 's', 'b', ${u!.id})`;
  await owner`insert into session (id, expires_at, token, user_id) values ('s1', now() + interval '1 day', 'tok1', ${u!.id})`;
});

afterAll(async () => {
  await client.close();
  await closeTestConnections();
});

const row = async () => {
  const [r] = await owner<
    {
      id: string;
      password: string;
      must_change_password: boolean;
      two_factor_enabled: boolean;
      sessions: number;
      factors: number;
    }[]
  >`select u.id, a.password, u.must_change_password, u.two_factor_enabled,
      (select count(*)::int from session s where s.user_id = u.id) as sessions,
      (select count(*)::int from two_factor t where t.user_id = u.id) as factors
    from "user" u join account a on a.user_id = u.id and a.provider_id = 'credential'
    where u.username = 'diretor'`;
  return r!;
};

describe('resetPassword (acesso de emergência pelo terminal)', () => {
  it('usuário inexistente: erro e nada muda', async () => {
    await expect(
      resetPassword(client.db, 'ninguem', { hashPassword, password: 'x' }),
    ).rejects.toThrow('Usuário não encontrado');
  });

  it('troca a senha, obriga trocar no login, derruba sessões e audita', async () => {
    const { userId } = await resetPassword(client.db, ' Diretor ', {
      hashPassword,
      password: 'temporaria',
    });
    const r = await row();
    expect(userId).toBe(r.id);
    expect(r.password).toBe('hashed:temporaria');
    expect(r.must_change_password).toBe(true);
    expect(r.sessions).toBe(0);
    // Sem pedir, o autenticador continua como estava.
    expect(r.two_factor_enabled).toBe(true);
    expect(r.factors).toBe(1);
    const audit = await owner<{ actor_id: string | null; entity_id: string; data: unknown }[]>`
      select actor_id, entity_id, data from audit_log where action = 'cli.user.reset_password'`;
    expect(audit).toEqual([{ actor_id: null, entity_id: r.id, data: { mfa: false } }]);
  });

  it('com resetMfa, também desliga o autenticador', async () => {
    await resetPassword(client.db, 'diretor', {
      hashPassword,
      password: 'outra',
      resetMfa: true,
    });
    const r = await row();
    expect(r.password).toBe('hashed:outra');
    expect(r.two_factor_enabled).toBe(false);
    expect(r.factors).toBe(0);
    const [last] = await owner<{ data: unknown }[]>`
      select data from audit_log where action = 'cli.user.reset_password' order by id desc limit 1`;
    expect(last!.data).toEqual({ mfa: true });
  });
});
