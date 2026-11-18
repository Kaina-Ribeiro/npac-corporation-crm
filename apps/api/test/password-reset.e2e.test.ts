import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FORGOT_MIN_MS } from '../src/auth/password-reset.js';
import { MAIL_SENDER } from '../src/mail/mail.js';
import {
  api,
  closeTestApp,
  createTestApp,
  deactivate,
  MemoryMailSender,
  ORIGIN,
  owner,
  resetAuthState,
  TEST_PASSWORD,
} from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let mail: MemoryMailSender;
let originalHash = '';

const FORGOT = '/api/auth/forgot-password';
const RESET = '/api/auth/forgot-password/reset';
const STATUS = '/api/auth/forgot-password/status';
const EMAIL = 'murilo@npac.com.br';

/** Pedido "de outro IP": o rate limit por IP é zerado antes (o limite por conta não). */
const forgot = async (login: string) => {
  await owner`truncate rate_limit`;
  return h.post(FORGOT, { login });
};
const tokenOf = (i = -1) => {
  const m = mail.sent.at(i);
  const t = /\/login\/nova-senha#t=([A-Za-z0-9_-]+)/.exec(m?.text ?? '')?.[1];
  if (!t) throw new Error('e-mail sem link');
  return t;
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  mail = app.get<MemoryMailSender>(MAIL_SENDER);
  const [row] = await owner<{ password: string }[]>`
    select a.password from account a join "user" u on u.id = a.user_id
    where u.email = ${EMAIL} and a.provider_id = 'credential'`;
  originalHash = row?.password ?? '';
});
beforeEach(async () => {
  await resetAuthState();
  mail.sent = [];
  mail.enabled = true;
});
afterEach(async () => {
  await owner`
    update account set password = ${originalHash}
    where provider_id = 'credential' and user_id = (select id from "user" where email = ${EMAIL})`;
});
afterAll(async () => {
  await resetAuthState();
  await closeTestApp(app);
});

describe('esqueci minha senha', () => {
  it('sem SMTP: a tela sabe que está desligado e o pedido não existe', async () => {
    expect((await h.get(STATUS)).body).toEqual({ enabled: true });
    mail.enabled = false;
    expect((await h.get(STATUS)).body).toEqual({ enabled: false });
    expect((await h.post(FORGOT, { login: 'murilo' })).status).toBe(404);
    expect(mail.sent).toHaveLength(0);
  });

  it('responde igual e no mesmo tempo exista ou não a conta; só quem existe recebe', async () => {
    const times: number[] = [];
    const bodies: unknown[] = [];
    for (const login of ['murilo', 'MURILO@npac.com.br', 'ninguem', 'ninguem@npac.com.br']) {
      const t0 = Date.now();
      const res = await forgot(login);
      times.push(Date.now() - t0);
      expect(res.status).toBe(200);
      bodies.push(res.body);
    }
    for (const b of bodies) expect(b).toEqual({ ok: true });
    for (const t of times) expect(t).toBeGreaterThanOrEqual(FORGOT_MIN_MS - 5);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(250);
    // Por usuário e por e-mail (sem diferenciar maiúsculas): os dois chegam à mesma pessoa.
    expect(mail.sent.map((m) => m.to)).toEqual([EMAIL, EMAIL]);
  });

  it('e-mail em português com o botão, o link sem e-mail nem usuário e só o primeiro nome', async () => {
    await owner`update "user" set name = 'Murilo Teste da Silva' where email = ${EMAIL}`;
    try {
      await forgot('murilo');
    } finally {
      await owner`update "user" set name = 'Murilo' where email = ${EMAIL}`;
    }
    const m = mail.sent[0]!;
    expect(m.subject).toBe('Criar nova senha');
    expect(m.text).toContain('Olá, Murilo.');
    expect(m.text).not.toContain('Silva');
    expect(m.html).toContain('>Criar nova senha</a>');
    expect(m.text).toContain('1 hora');
    const url = /(\S+\/login\/nova-senha#t=\S+)/.exec(m.text)?.[1] ?? '';
    expect(url.startsWith(`${ORIGIN}/login/nova-senha#t=`)).toBe(true);
    expect(url).not.toContain('@');
    expect(url).not.toContain('murilo');
    for (const body of [m.text, m.html]) expect(body).not.toContain('npac.com.br');
  });

  it('link troca a senha, entra com a nova e derruba as sessões abertas', async () => {
    const before = await h.signIn(EMAIL); // zera a troca obrigatória e abre uma sessão
    await owner`update "user" set must_change_password = true where email = ${EMAIL}`;
    await forgot('murilo');
    const res = await h.post(RESET, { token: tokenOf(), newPassword: 'senha-nova-1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, username: 'murilo' });
    expect((await h.get('/api/me', before)).status).toBe(401);
    expect((await h.signInRaw(EMAIL, TEST_PASSWORD)).status).toBe(401);
    const signed = await h.signInRaw(EMAIL, 'senha-nova-1');
    expect(signed.status).toBe(200);
    // Senha escolhida pela própria pessoa: não pede outra troca.
    const [u] = await owner<{ must: boolean }[]>`
      select must_change_password as must from "user" where email = ${EMAIL}`;
    expect(u?.must).toBe(false);
  });

  it('link de uso único', async () => {
    await forgot('murilo');
    const token = tokenOf();
    expect((await h.post(RESET, { token, newPassword: 'senha-nova-1' })).status).toBe(200);
    const again = await h.post(RESET, { token, newPassword: 'senha-nova-2' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_TOKEN');
    expect((await h.signInRaw(EMAIL, 'senha-nova-1')).status).toBe(200);
  });

  it('dois cliques ao mesmo tempo: só um troca a senha', async () => {
    await forgot('murilo');
    const token = tokenOf();
    const results = await Promise.all([
      h.post(RESET, { token, newPassword: 'senha-nova-a' }),
      h.post(RESET, { token, newPassword: 'senha-nova-b' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('link vence em 1 hora', async () => {
    await forgot('murilo');
    const [v] = await owner<{ mins: number }[]>`
      select round(extract(epoch from expires_at - created_at) / 60)::int as mins
      from verification where identifier like 'npac-reset:%'`;
    expect(v?.mins).toBe(60);
    await owner`update verification set expires_at = now() - interval '1 second'
      where identifier like 'npac-reset:%'`;
    const res = await h.post(RESET, { token: tokenOf(), newPassword: 'senha-nova-1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
    expect((await h.signInRaw(EMAIL, TEST_PASSWORD)).status).toBe(200);
  });

  it('o banco guarda só o hash do link', async () => {
    await forgot('murilo');
    const token = tokenOf();
    const rows = await owner<{ identifier: string }[]>`select identifier from verification`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.identifier).not.toContain(token);
  });

  it('trocar a senha invalida os outros links ainda abertos', async () => {
    await forgot('murilo');
    await forgot('murilo');
    const [first, second] = [tokenOf(0), tokenOf(1)];
    expect((await h.post(RESET, { token: second, newPassword: 'senha-nova-1' })).status).toBe(200);
    expect((await h.post(RESET, { token: first, newPassword: 'senha-nova-2' })).status).toBe(400);
  });

  it('limite de 3 por hora por conta, mesmo trocando de IP (a resposta não muda)', async () => {
    for (let i = 0; i < 4; i++) {
      const res = await forgot(i % 2 ? 'murilo' : EMAIL);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    }
    expect(mail.sent).toHaveLength(3);
  });

  it('limite de 3 por hora por IP', async () => {
    await owner`truncate rate_limit`;
    for (const login of ['ninguem1', 'ninguem2', 'ninguem3'])
      expect((await h.post(FORGOT, { login })).status).toBe(200);
    expect((await h.post(FORGOT, { login: 'murilo' })).status).toBe(429);
    expect(mail.sent).toHaveLength(0);
  });

  it('conta desativada não recebe e não usa link já enviado', async () => {
    await forgot('murilo');
    const token = tokenOf();
    await deactivate(EMAIL);
    expect((await forgot('murilo')).body).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(1);
    const res = await h.post(RESET, { token, newPassword: 'senha-nova-1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('senha curta demais é recusada sem gastar o link', async () => {
    await forgot('murilo');
    const token = tokenOf();
    const short = await h.post(RESET, { token, newPassword: '12' });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('PASSWORD_TOO_SHORT');
    expect((await h.post(RESET, { token, newPassword: '123' })).status).toBe(200);
  });

  it('auditoria do pedido e da troca, sem e-mail', async () => {
    await forgot('murilo');
    await forgot('ninguem');
    await h.post(RESET, { token: tokenOf(), newPassword: 'senha-nova-1' });
    const rows = await owner<{ action: string; entity_id: string | null; row: string }[]>`
      select action, entity_id, to_jsonb(a)::text as row from audit_log a
      where action like 'auth.password_reset%' order by id`;
    expect(rows.map((r) => r.action)).toEqual([
      'auth.password_reset.requested',
      'auth.password_reset',
    ]);
    const [u] = await owner<{ id: string }[]>`select id from "user" where email = ${EMAIL}`;
    for (const r of rows) {
      expect(r.entity_id).toBe(u?.id);
      expect(r.row).not.toContain('@');
    }
  });

  it('a redefinição do próprio Better Auth fica desligada', async () => {
    expect((await h.post('/api/auth/request-password-reset', { email: EMAIL })).status).toBe(404);
    expect(
      (await h.post('/api/auth/reset-password', { newPassword: 'x', token: 'y' })).status,
    ).toBe(404);
  });
});
