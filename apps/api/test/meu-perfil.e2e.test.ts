import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAIL_SENDER } from '../src/mail/mail.js';
import {
  api,
  auditCount,
  closeTestApp,
  createTestApp,
  MemoryMailSender,
  owner,
  resetAuthState,
} from './helpers.js';

// NPAC-53: Meu perfil. Cada um lê a própria conta e troca o próprio nome.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let mail: MemoryMailSender;
const ANA = 'ana@npac.com.br';
let nomeOriginal = '';

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  mail = app.get<MemoryMailSender>(MAIL_SENDER);
  nomeOriginal = (await owner<{ name: string }[]>`select name from "user" where email = ${ANA}`)[0]!
    .name;
});
beforeEach(async () => {
  await resetAuthState();
  mail.enabled = true;
});
afterAll(async () => {
  await owner`update "user" set name = ${nomeOriginal}, image = null where email = ${ANA}`;
  await resetAuthState();
  await closeTestApp(app);
});

describe('Meu perfil', () => {
  it('mostra nome, usuário, e-mail, foto e se o envio de e-mail está ligado', async () => {
    const ana = await h.signIn(ANA);
    const res = await h.get('/api/me/profile', ana);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: nomeOriginal,
      username: 'ana',
      email: ANA,
      photo: null,
      mailEnabled: true,
      telegram: null,
    });
    mail.enabled = false;
    expect((await h.get('/api/me/profile', ana)).body.mailEnabled).toBe(false);
  });

  it('troca o nome sem os espaços das pontas e o /me já devolve o novo', async () => {
    const ana = await h.signIn(ANA);
    const res = await h.patch('/api/me/profile', { name: '  Ana Souza  ' }, ana);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ana Souza');
    expect((await h.get('/api/me', ana)).body.name).toBe('Ana Souza');
    expect(await auditCount('user.name_changed')).toBe(1);
    const [row] = await owner<{ data: unknown }[]>`
      select data from audit_log where action = 'user.name_changed'`;
    expect(JSON.stringify(row?.data)).not.toMatch(/Ana/);
  });

  it('recusa nome vazio, curto ou longo demais', async () => {
    const ana = await h.signIn(ANA);
    for (const name of ['', '   ', ' a ', 'x'.repeat(81)]) {
      const res = await h.patch('/api/me/profile', { name }, ana);
      expect(res.status, JSON.stringify(name)).toBe(400);
      expect(res.body.message).toBe('Digite o seu nome.');
    }
  });

  it('o /me traz a foto', async () => {
    const ana = await h.signIn(ANA);
    await owner`update "user" set image = 'abc' where email = ${ANA}`;
    const id = (await h.get('/api/me', ana)).body.id as string;
    expect((await h.get('/api/me', ana)).body.photo).toBe(`/api/users/${id}/photo?v=abc`);
  });

  it('a lista de usuários do Admin traz a foto', async () => {
    await owner`update "user" set image = 'abc' where email = ${ANA}`;
    const res = await h.get('/api/admin/users', await h.signIn('diretor@npac.com.br'));
    const ana = (res.body as { email: string; photo: string | null; id: string }[]).find(
      (u) => u.email === ANA,
    );
    expect(ana?.photo).toBe(`/api/users/${ana?.id}/photo?v=abc`);
  });

  it('o update-user e o change-email do Better Auth ficam desligados', async () => {
    const ana = await h.signIn(ANA);
    expect(
      (await h.post('/api/auth/update-user', { name: 'X', image: 'http://x' }, ana)).status,
    ).toBe(404);
    expect((await h.post('/api/auth/change-email', { newEmail: 'x@x.com' }, ana)).status).toBe(404);
  });
});
