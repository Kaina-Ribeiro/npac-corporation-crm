import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { mailError, SmtpMailSender } from '../src/mail/mail.js';
import { resetPasswordMail } from '../src/mail/templates.js';
import { startCaixaFalsa, type CaixaFalsa } from '../../../scripts/caixa-falsa.mjs';

let caixa: CaixaFalsa;
beforeAll(async () => {
  caixa = await startCaixaFalsa();
});
afterAll(() => caixa.close());

const env = (extra: Record<string, string>) => loadEnv({ ...process.env, ...extra });

describe('envio por SMTP', () => {
  it('sem SMTP_HOST fica desligado e não tenta enviar', async () => {
    const sender = new SmtpMailSender(env({}));
    expect(sender.enabled).toBe(false);
    expect(await sender.send(resetPasswordMail('a@b.test', 'Ana', 'http://x/y', '1 hora'))).toBe(
      false,
    );
  });

  it('entrega pelo SMTP o e-mail com texto e HTML, sem o destinatário no log', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });
    const sender = new SmtpMailSender(
      env({
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(caixa.smtpPort),
        SMTP_USER: 'sistema',
        SMTP_PASS: 'senha-de-app',
        MAIL_FROM: 'NPAC <crm@npac.test>',
      }),
    );
    expect(sender.enabled).toBe(true);
    const url = 'http://localhost:3000/login/nova-senha#t=abc_DEF-123';
    expect(
      await sender.send(resetPasswordMail('pessoa@npac.test', 'Ana Maria', url, '1 hora')),
    ).toBe(true);
    spy.mockRestore();
    const m = caixa.mensagens.at(-1)!;
    expect(m.to).toEqual(['pessoa@npac.test']);
    expect(m.subject).toBe('Criar nova senha');
    expect(m.text).toContain('Olá, Ana.');
    expect(m.text).toContain(url);
    expect(m.html).toContain(`href="${url}"`);
    expect(m.html).toContain('Recebemos um pedido para criar uma nova senha');
    expect(logs.join('\n')).toContain('e-mail enviado: 127.0.0.1');
    expect(logs.join('\n')).not.toContain('@');
  });

  it('servidor fora do ar: volta false e o log traz só o código do erro', async () => {
    const warns: string[] = [];
    const spy = vi.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
      warns.push(String(m));
    });
    const sender = new SmtpMailSender(
      env({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', MAIL_FROM: 'crm@npac.test' }),
    );
    expect(
      await sender.send(resetPasswordMail('pessoa@npac.test', 'Ana', 'http://x', '1 hora')),
    ).toBe(false);
    spy.mockRestore();
    expect(warns.join('\n')).toMatch(/e-mail não enviado: ECONNECTION|ESOCKET|ECONNREFUSED/);
    expect(warns.join('\n')).not.toContain('pessoa@');
  });

  it('mailError nunca devolve endereço', () => {
    expect(mailError({ code: 'EAUTH', responseCode: 535 })).toBe('EAUTH 535');
    expect(mailError(new Error('recusado para pessoa@npac.test agora'))).toBe(
      'recusado para agora',
    );
  });

  it('SMTP_HOST exige MAIL_FROM; usuário e senha vêm juntos', () => {
    expect(() => env({ SMTP_HOST: 'smtp.gmail.com' })).toThrow(/MAIL_FROM/);
    expect(() => env({ SMTP_HOST: 'smtp.gmail.com', MAIL_FROM: 'x@y.z', SMTP_USER: 'x' })).toThrow(
      /SMTP_PASS/,
    );
  });
});
