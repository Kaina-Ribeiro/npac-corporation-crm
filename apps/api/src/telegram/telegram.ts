import { Logger } from '@nestjs/common';
import type { PushPayload } from '../push/push.service.js';

/** Botão abaixo da mensagem (só endereço `https:`: o Telegram recusa `http://localhost`). */
export type TelegramButton = { text: string; url: string };
/** `gone` = a pessoa bloqueou o bot (403): a API apaga o vínculo. */
export type TelegramResult = 'ok' | 'gone' | 'error';

export interface TelegramSender {
  /** `html` já escapado (parse_mode HTML). Nunca lança. */
  send(chatId: string, html: string, button?: TelegramButton): Promise<TelegramResult>;
  /** Registra o webhook no Telegram (ao subir a API). Nunca lança. */
  setWebhook(url: string, secret: string): Promise<boolean>;
}
export const TELEGRAM_SENDER = Symbol('TELEGRAM_SENDER');

/** Prazo para o Telegram responder, como o do push (NPAC-71). */
export const TELEGRAM_TIMEOUT_MS = 10_000;

/**
 * S1 da spec (NPAC-74): o aviso vai com o mesmo texto do push, que pode ter o nome do lead. Mensagem de
 * bot fica legível nos servidores do Telegram; `true` manda só "Novo aviso no CRM" e o botão.
 */
export const TELEGRAM_SEM_NOME = false;

/** Textos do bot e do teste (spec, "Textos novos"). */
export const TELEGRAM_TEXTO = {
  conectado: (primeiroNome: string) =>
    `Pronto, ${escapeHtml(primeiroNome)}! Os avisos do NPAC CRM vão chegar aqui.`,
  linkInvalido:
    'Esse link não vale mais. No CRM, abra “Meu perfil” e toque em “Conectar Telegram” de novo.',
  semCodigo:
    'Para receber os avisos do NPAC CRM aqui, abra o CRM, vá em “Meu perfil” e toque em “Conectar Telegram”.',
  botao: 'Abrir no CRM',
  semNome: 'Novo aviso no CRM',
  teste: {
    title: 'Aviso de teste do NPAC CRM',
    body: 'Se chegou, está tudo certo.',
    url: '/conta/perfil',
    tag: 'telegram-teste',
  } satisfies PushPayload,
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Título em negrito e o corpo embaixo, como o aviso do aparelho. */
export function telegramHtml(p: Pick<PushPayload, 'title' | 'body'>): string {
  if (TELEGRAM_SEM_NOME) return `<b>${TELEGRAM_TEXTO.semNome}</b>`;
  return `<b>${escapeHtml(p.title)}</b>${p.body ? `\n${escapeHtml(p.body)}` : ''}`;
}

/**
 * Bot API do Telegram por HTTPS. O token vai no caminho da URL: nunca entra em log (só o status e o
 * host), como o chat, o texto e qualquer dado da pessoa.
 */
export class BotApiTelegramSender implements TelegramSender {
  private readonly log = new Logger('Telegram');
  private readonly host: string;
  constructor(
    private readonly token: string,
    private readonly base: string,
  ) {
    this.host = new URL(base).host;
  }

  private async call(method: string, body: unknown): Promise<number | string> {
    try {
      const res = await fetch(`${this.base}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      });
      await res.arrayBuffer().catch(() => undefined);
      return res.status;
    } catch (e) {
      const err = e as { name?: string; cause?: { code?: string } };
      return err.cause?.code ?? err.name ?? 'erro';
    }
  }

  async send(chatId: string, html: string, button?: TelegramButton): Promise<TelegramResult> {
    const status = await this.call('sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(button ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
    });
    if (typeof status === 'string') {
      this.log.warn(`telegram sem resposta: ${status} ${this.host}`);
      return 'error';
    }
    if (status >= 200 && status < 300) {
      this.log.log(`telegram enviado: ${status} ${this.host}`);
      return 'ok';
    }
    if (status === 403) {
      this.log.log(`telegram bloqueado, vínculo apagado: ${status} ${this.host}`);
      return 'gone';
    }
    this.log.warn(`telegram recusado: ${status} ${this.host}`);
    return 'error';
  }

  async setWebhook(url: string, secret: string): Promise<boolean> {
    const status = await this.call('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message'],
    });
    const ok = typeof status === 'number' && status >= 200 && status < 300;
    if (ok) this.log.log(`telegram webhook registrado: ${status} ${this.host}`);
    else this.log.warn(`telegram webhook não registrado: ${status} ${this.host}`);
    return ok;
  }
}

/** Sem as variáveis: nada sai (o serviço nem chega a chamar). */
export class DisabledTelegramSender implements TelegramSender {
  send(): Promise<TelegramResult> {
    return Promise.resolve('ok');
  }
  setWebhook(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
