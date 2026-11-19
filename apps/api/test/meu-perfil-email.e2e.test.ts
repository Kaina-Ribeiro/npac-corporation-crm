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
  type Cookie,
} from './helpers.js';

// NPAC-53: troca de e-mail com código de 6 dígitos enviado ao endereço novo.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let mail: MemoryMailSender;
const ANA = 'ana@npac.com.br';
const NOVO = 'ana.souza@exemplo.test';
const CODE = '/api/me/email/code';
const CONFIRM = '/api/me/email/confirm';

const codigo = (i = -1) => {
  const m = mail.sent.filter((x) => x.subject === 'Seu código para trocar o e-mail').at(i);
  const c = /\b(\d{6})\b/.exec(m?.text ?? '')?.[1];
  if (!c) throw new Error('e-mail sem código');
  return c;
};
const errado = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, '0');
const emailDe = async () =>
  (await owner<{ email: string }[]>`select email from "user" where username = 'ana'`)[0]!.email;

let ana: Cookie;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  mail = app.get<MemoryMailSender>(MAIL_SENDER);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`update "user" set email = ${ANA} where username = 'ana'`;
  mail.sent = [];
  mail.enabled = true;
  ana = await h.signIn(ANA);
});
afterAll(async () => {
  await owner`update "user" set email = ${ANA} where username = 'ana'`;
  await resetAuthState();
  await closeTestApp(app);
});

describe('troca de e-mail', () => {
  it('código no endereço novo troca o e-mail e avisa o antigo', async () => {
    expect((await h.post(CODE, { email: `  ${NOVO.toUpperCase()} ` }, ana)).status).toBe(204);
    expect(mail.sent.at(-1)?.to).toBe(NOVO);
    const res = await h.post(CONFIRM, { code: codigo() }, ana);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: NOVO });
    expect(await emailDe()).toBe(NOVO);
    const aviso = mail.sent.at(-1)!;
    expect(aviso.to).toBe(ANA);
    expect(aviso.subject).toBe('O e-mail da sua conta foi trocado');
    expect(aviso.text).not.toContain(NOVO);
  });

  it('o próprio e-mail, com maiúsculas e espaços, é recusado', async () => {
    const res = await h.post(CODE, { email: '  Ana@NPAC.com.br ' }, ana);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Esse já é o seu e-mail.');
    expect(mail.sent).toHaveLength(0);
  });

  it('e-mail de outra pessoa: em uso, sem dizer de quem, sem enviar', async () => {
    const res = await h.post(CODE, { email: 'IGOR@npac.com.br' }, ana);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Esse e-mail já está em uso.');
    expect(mail.sent).toHaveLength(0);
  });

  it('e-mail inválido: 400', async () => {
    expect((await h.post(CODE, { email: 'sem-arroba' }, ana)).status).toBe(400);
  });

  it('código errado; depois de 5 erros o código deixa de valer', async () => {
    await h.post(CODE, { email: NOVO }, ana);
    const certo = codigo();
    const e1 = await h.post(CONFIRM, { code: errado(certo) }, ana);
    expect(e1.status).toBe(400);
    expect(e1.body.message).toBe('Código errado. Confira e tente de novo.');
    for (let i = 0; i < 4; i++) await h.post(CONFIRM, { code: errado(certo) }, ana);
    const fim = await h.post(CONFIRM, { code: certo }, ana);
    expect(fim.status).toBe(400);
    expect(fim.body.message).toBe('Esse código venceu. Peça outro.');
    expect(await emailDe()).toBe(ANA);
  });

  it('código vencido não troca', async () => {
    await h.post(CODE, { email: NOVO }, ana);
    await owner`update verification set expires_at = now() - interval '1 second'
      where identifier like 'npac-email:%'`;
    const res = await h.post(CONFIRM, { code: codigo() }, ana);
    expect(res.body.message).toBe('Esse código venceu. Peça outro.');
  });

  it('pedido novo invalida o código anterior', async () => {
    await h.post(CODE, { email: NOVO }, ana);
    const primeiro = codigo();
    await h.post(CODE, { email: 'outro@exemplo.test' }, ana);
    const segundo = codigo();
    if (primeiro !== segundo)
      expect((await h.post(CONFIRM, { code: primeiro }, ana)).status).toBe(400);
    expect((await h.post(CONFIRM, { code: segundo }, ana)).body).toEqual({
      email: 'outro@exemplo.test',
    });
  });

  it('até 3 códigos por hora', async () => {
    for (let i = 0; i < 3; i++) expect((await h.post(CODE, { email: NOVO }, ana)).status).toBe(204);
    const res = await h.post(CODE, { email: NOVO }, ana);
    expect(res.status).toBe(429);
    expect(res.body.message).toBe('Muitos pedidos. Tente de novo mais tarde.');
  });

  it('sem envio de e-mail configurado: 404', async () => {
    mail.enabled = false;
    expect((await h.post(CODE, { email: NOVO }, ana)).status).toBe(404);
    expect((await h.post(CONFIRM, { code: '123456' }, ana)).status).toBe(404);
  });

  it('audita sem e-mail', async () => {
    await h.post(CODE, { email: NOVO }, ana);
    await h.post(CONFIRM, { code: codigo() }, ana);
    expect(await auditCount('user.email_code_sent')).toBe(1);
    expect(await auditCount('user.email_changed')).toBe(1);
    const rows = await owner<{ data: unknown }[]>`
      select data from audit_log where action like 'user.email%'`;
    expect(JSON.stringify(rows)).not.toContain('@');
  });
});
