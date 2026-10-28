import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Secret, TOTP } from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  auditCount,
  closeTestApp,
  cookiesOf,
  createTestApp,
  deactivate,
  leadCreateRoute,
  owner,
  protectedRoute,
  resetAuthState,
  TEST_PASSWORD,
} from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => resetAuthState());

const totpFrom = (uri: string) =>
  new TOTP({ secret: Secret.fromBase32(new URL(uri).searchParams.get('secret') ?? '') });

describe('autenticação', () => {
  it('sessão dura 30 dias e o cookie só é Secure quando a origem é https', async () => {
    await owner`update "user" set must_change_password = false where email = 'ale@npac.com.br'`;
    const res = await h.signInRaw('ale@npac.com.br');
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.includes('session_token='),
    )!;
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).not.toMatch(/Secure/);
    const [s] = await owner<{ days: number }[]>`
      select round(extract(epoch from expires_at - created_at) / 86400)::int as days
      from session order by created_at desc limit 1`;
    expect(s!.days).toBe(30);
  });
  it('não existe cadastro aberto', async () => {
    const res = await h.post('/api/auth/sign-up/email', {
      email: 'novo@npac.com.br',
      password: 'senha-forte-demais-123',
      name: 'Novo',
    });
    expect(res.status).not.toBe(200);
    const [r] = await owner<{ n: number }[]>`
      select count(*)::int as n from "user" where email = 'novo@npac.com.br'`;
    expect(r?.n).toBe(0);
  });

  it('login do SDR funciona e /me retorna papel', async () => {
    const s = await h.signIn('ale@npac.com.br');
    const me = await h.get('/api/me', s);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ role: 'SDR', canProspect: true, canClose: false, name: 'Ale' });
    expect(me.body).not.toHaveProperty('email');
    expect(await auditCount('auth.sign_in.success')).toBe(1);
  });

  it('senha errada → 401 e auditado', async () => {
    expect((await h.signInRaw('ale@npac.com.br', 'errada-errada')).status).toBe(401);
    expect(await auditCount('auth.sign_in.failure')).toBe(1);
  });

  it('6ª tentativa em 1 min → 429', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await h.signInRaw('ale@npac.com.br', 'errada-errada')).status).toBe(401);
    }
    expect((await h.signInRaw('ale@npac.com.br', 'errada-errada')).status).toBe(429);
  });

  it('sem sessão → 401', async () => expect((await h.get(protectedRoute)).status).toBe(401));

  it('health é público', async () => expect((await h.get('/api/health')).status).toBe(200));

  it('HEAD sem MFA é barrado fora do /me', async () => {
    const s = await h.signIn('ana@npac.com.br');
    const res = await h.get(protectedRoute, s);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MFA_ENROLLMENT_REQUIRED');
    const me = await h.get('/api/me', s);
    expect(me.status).toBe(200);
    expect(me.body.mfaPending).toBe(true);
  });

  it('HEAD com MFA precisa do TOTP para entrar', async () => {
    const s = await h.signIn('ana@npac.com.br');
    const enable = await h.post('/api/auth/two-factor/enable', { password: TEST_PASSWORD }, s);
    expect(enable.status).toBe(200);
    const totp = totpFrom(enable.body.totpURI);
    const verify = await h.post('/api/auth/two-factor/verify-totp', { code: totp.generate() }, s);
    expect(verify.status).toBe(200);

    const first = await h.signInRaw('ana@npac.com.br');
    expect(first.status).toBe(200);
    expect(first.body.twoFactorRedirect).toBe(true);
    const pending = cookiesOf(first);
    expect((await h.get(protectedRoute, pending)).status).toBe(401);
    // Só o login inicial (antes do MFA) conta como sucesso até aqui.
    expect(await auditCount('auth.sign_in.success')).toBe(1);

    const second = await h.post(
      '/api/auth/two-factor/verify-totp',
      { code: totp.generate() },
      pending,
    );
    expect(second.status).toBe(200);
    expect((await h.get(protectedRoute, cookiesOf(second))).status).toBe(200);
    expect(await auditCount('auth.sign_in.success')).toBe(2);
  });

  it('usuário desativado perde a sessão aberta na hora', async () => {
    const s = await h.signIn('igor@npac.com.br');
    expect((await h.get('/api/me', s)).status).toBe(200);
    await deactivate('igor@npac.com.br');
    expect((await h.get('/api/me', s)).status).toBe(401);
    const [r] = await owner<{ n: number }[]>`
      select count(*)::int as n from session s join "user" u on u.id = s.user_id
      where u.email = 'igor@npac.com.br'`;
    expect(r?.n).toBe(0);
  });

  it('troca de senha obrigatória no primeiro acesso', async () => {
    const [before] = await owner<{ password: string }[]>`
      select a.password from account a join "user" u on u.id = a.user_id
      where u.email = 'murilo@npac.com.br'`;
    const s = cookiesOf(await h.signInRaw('murilo@npac.com.br'));
    const blocked = await h.get(protectedRoute, s);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await h.get('/api/me', s)).body.mustChangePassword).toBe(true);

    const change = await h.post(
      '/api/auth/change-password',
      { currentPassword: TEST_PASSWORD, newPassword: 'nova-senha-do-murilo-1' },
      s,
    );
    expect(change.status).toBe(200);
    expect((await h.get(protectedRoute, s)).status).toBe(200);
    await owner`
      update account set password = ${before?.password ?? ''}
      where user_id = (select id from "user" where email = 'murilo@npac.com.br')`;
  });

  it('@Can barra CLOSER em lead:create', async () => {
    const sonia = await h.signIn('sonia@npac.com.br');
    expect((await h.get(leadCreateRoute, sonia)).status).toBe(403);
    const ale = await h.signIn('ale@npac.com.br');
    expect((await h.get(leadCreateRoute, ale)).status).toBe(200);
  });

  it('logout é auditado e derruba a sessão', async () => {
    const s = await h.signIn('ale@npac.com.br');
    expect((await h.post('/api/auth/sign-out', {}, s)).status).toBe(200);
    expect(await auditCount('auth.sign_out')).toBe(1);
    expect((await h.get('/api/me', s)).status).toBe(401);
  });

  it('auditoria de login não guarda e-mail', async () => {
    await h.signInRaw('ale@npac.com.br', 'errada-errada');
    await h.signIn('ale@npac.com.br');
    const rows = await owner<{ d: string }[]>`select data::text as d from audit_log`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.d).not.toContain('@');
  });
});
