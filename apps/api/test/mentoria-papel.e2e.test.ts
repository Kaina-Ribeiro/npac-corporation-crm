import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ids: Record<string, string>;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await owner`update "user" set role = 'SDR' where email = 'ale@npac.com.br'`;
  await owner`update "user" set role = 'HEAD', two_factor_enabled = false where email = 'ana@npac.com.br'`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`update "user" set role = 'SDR' where email = 'ale@npac.com.br'`;
  await owner`update "user" set role = 'HEAD' where email = 'ana@npac.com.br'`;
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
});

const login = async (email: string) => {
  const s = await h.signIn(email);
  await owner`update "user" set two_factor_enabled = true where email = ${email}`;
  return s;
};

describe('cargo Acompanhamento', () => {
  it('HEAD não atribui cargo ACOMPANHAMENTO (403)', async () => {
    const head = await login('ronaldo@npac.com.br');
    const res = await h.patch(`/api/admin/users/${ids.ale}`, { role: 'ACOMPANHAMENTO' }, head);
    expect(res.status).toBe(403);
    const invite = await h.post(
      '/api/admin/users',
      {
        name: 'Equipe Acompanhamento',
        email: 'acomp@novo.test',
        username: 'acompnovo',
        role: 'ACOMPANHAMENTO',
        canProspect: false,
        canClose: false,
      },
      head,
    );
    expect(invite.status).toBe(403);
  });

  it('DIRETOR atribui (200)', async () => {
    await owner`update "user" set role = 'DIRETOR' where email = 'ana@npac.com.br'`;
    const diretor = await login('ana@npac.com.br');
    const res = await h.patch(`/api/admin/users/${ids.ale}`, { role: 'ACOMPANHAMENTO' }, diretor);
    expect(res.status).toBe(200);
    const [row] = await owner<
      { role: string }[]
    >`select role from "user" where email = 'ale@npac.com.br'`;
    expect(row?.role).toBe('ACOMPANHAMENTO');
  });

  it('HEAD não administra conta ACOMPANHAMENTO', async () => {
    await owner`update "user" set role = 'ACOMPANHAMENTO' where email = 'ale@npac.com.br'`;
    const head = await login('ronaldo@npac.com.br');
    const res = await h.patch(`/api/admin/users/${ids.ale}`, { active: false }, head);
    expect(res.status).toBe(403);
  });

  it('/api/me devolve modules.mentoria só para Diretoria e Acompanhamento', async () => {
    await owner`update "user" set role = 'DIRETOR' where email = 'ana@npac.com.br'`;
    for (const [email, esperado] of [
      ['ana@npac.com.br', true],
      ['carla@npac.com.br', true],
      ['ronaldo@npac.com.br', false],
      ['ale@npac.com.br', false],
      ['sonia@npac.com.br', false],
    ] as const) {
      const s = await h.signIn(email);
      expect((await h.get('/api/me', s)).body.modules, email).toEqual({ mentoria: esperado });
    }
  });
});
