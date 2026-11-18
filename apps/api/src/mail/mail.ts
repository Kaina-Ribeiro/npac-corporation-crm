import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';

/** Um e-mail do sistema: texto puro e HTML com o mesmo conteúdo. */
export type MailMessage = { to: string; subject: string; text: string; html: string };

export interface MailSender {
  /** Sem servidor configurado, nada sai e as telas seguem pelo caminho da liderança. */
  readonly enabled: boolean;
  /** Nunca lança: falha vai para o log (sem o destinatário) e volta `false`. */
  send(message: MailMessage): Promise<boolean>;
}
export const MAIL_SENDER = Symbol('MAIL_SENDER');

/** Código do erro do nodemailer (EAUTH, ETIMEDOUT, ECONNECTION…) e a resposta SMTP, sem endereços. */
export function mailError(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown; message?: unknown };
  const parts = [e.code, e.responseCode].filter(
    (p) => typeof p === 'string' || typeof p === 'number',
  );
  if (parts.length) return parts.join(' ');
  const msg = typeof e.message === 'string' ? e.message : String(err);
  return msg
    .replace(/[^\s@<>]+@[^\s@<>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Envio por SMTP. Trocar Gmail por Resend, SES ou Brevo é só mudar `SMTP_*` e `MAIL_FROM`.
 * O log diz se saiu e, se não, o código do erro e o servidor: nunca o destinatário nem o texto.
 * Prazos curtos: porta bloqueada no servidor aparece como ETIMEDOUT em segundos, não em minutos.
 */
export class SmtpMailSender implements MailSender {
  private readonly log = new Logger('Mail');
  private readonly transport: Transporter | null;
  private readonly host: string;
  private readonly from: string;
  readonly enabled: boolean;

  constructor(env: Env) {
    this.host = env.SMTP_HOST ?? '';
    this.from = env.MAIL_FROM ?? '';
    this.enabled = !!env.SMTP_HOST && !!env.MAIL_FROM;
    this.transport = this.enabled
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        })
      : null;
  }

  async send(message: MailMessage): Promise<boolean> {
    if (!this.transport) return false;
    try {
      await this.transport.sendMail({ from: this.from, ...message });
      this.log.log(`e-mail enviado: ${this.host}`);
      return true;
    } catch (err) {
      this.log.warn(`e-mail não enviado: ${mailError(err)} ${this.host}`);
      return false;
    }
  }
}
