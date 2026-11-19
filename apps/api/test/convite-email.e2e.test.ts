import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAIL_SENDER } from '../src/mail/mail.js';
import {
  api,
  closeTestApp,
  createTestApp,
  MemoryMailSender,
  ORIGIN,
  owner,
  resetAuthState,
} from './helpers.js';

// Convite por e-mail (NPAC-54, pedido do Gabriel em 19/11: "texto ok, 1A, 2A"): quem é convidado
// recebe o usuário, a senha temporária e o botão para a tela de entrada da área dele. A tela
// continua mostrando a senha (1A). "Nova senha" não manda e-mail (2A).
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let mail: MemoryMailSender;

const limpar = async () => {
  await owner`delete from account where user_id in (select id from "user" where email like '%@convite.test')`;
  await owner`delete from "user" where email like '%@convite.test'`;
};
const convidar = async (corpo: object, nome = 'maria.souza') => {
  const diretor = await h.signIn('diretor@npac.com.br');
  const r = await h.post(
    '/api/admin/users',
    { name: 'Maria Souza Lima', email: `${nome}@convite.test`, username: nome, ...corpo },
    diretor,
  );
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return {
    diretor,
    body: r.body as { id: string; temporaryPassword: string; emailEnviado: boolean },
  };
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  mail = app.get(MAIL_SENDER);
});
afterAll(async () => {
  mail.enabled = true;
  await limpar();
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await limpar();
  mail.enabled = true;
  mail.sent = [];
});

describe('convite por e-mail', () => {
  it('manda usuário, senha temporária e o botão para a tela do CRM', async () => {
    const { body } = await convidar({ role: 'SDR' });
    expect(body.emailEnviado).toBe(true);
    expect(mail.sent).toHaveLength(1);
    const m = mail.sent[0]!;
    expect(m.to).toBe('maria.souza@convite.test');
    expect(m.subject).toBe('Seu acesso ao sistema da NPAC');
    for (const t of [m.text, m.html]) {
      expect(t).toContain('Oi, Maria.');
      expect(t).toContain('maria.souza');
      expect(t).toContain(body.temporaryPassword);
      expect(t).toContain(`${ORIGIN}/login`);
      expect(t).not.toContain('/login/acompanhamento');
      expect(t).toContain(
        'No primeiro acesso, o sistema pede para você trocar essa senha por uma sua.',
      );
    }
    // Só o primeiro nome: o sobrenome não vai no e-mail.
    expect(m.text).not.toContain('Souza Lima');
    expect(m.html).toContain('Entrar no sistema');
  });

  it('conta do Acompanhamento vai para a tela de entrada do módulo', async () => {
    const { body } = await convidar({ role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' }, 'op.convite');
    expect(body.emailEnviado).toBe(true);
    expect(mail.sent[0]!.text).toContain(`${ORIGIN}/login/acompanhamento`);
  });

  it('sem envio configurado, nada sai e a resposta diz que não foi', async () => {
    mail.enabled = false;
    const { body } = await convidar({ role: 'SDR' });
    expect(body.emailEnviado).toBe(false);
    expect(body.temporaryPassword).toBeTruthy();
    expect(mail.sent).toHaveLength(0);
  });

  it('"Nova senha" não manda e-mail (2A)', async () => {
    const { diretor, body } = await convidar({ role: 'SDR' });
    mail.sent = [];
    const r = await h.post(`/api/admin/users/${body.id}/reset-password`, {}, diretor);
    expect(r.status).toBe(200);
    expect(mail.sent).toHaveLength(0);
  });

  it('a auditoria do convite não guarda e-mail nem senha', async () => {
    const { body } = await convidar({ role: 'SDR' });
    const linhas = await owner<{ data: unknown }[]>`
      select data from audit_log where action = 'admin.user.invite'`;
    const texto = JSON.stringify(linhas);
    expect(texto).not.toContain('convite.test');
    expect(texto).not.toContain(body.temporaryPassword);
  });
});
