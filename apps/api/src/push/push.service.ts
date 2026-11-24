import { Inject, Injectable, Logger } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { sql } from 'drizzle-orm';
import webpush from 'web-push';
import type { Env } from '../config/env.js';
import { DB } from '../common/db/db.module.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';

/**
 * O que vai no push: só título curto, link interno e tag. Nunca texto de mensagem do chat,
 * telefone ou Instagram (o push passa pelos servidores do Google/Apple).
 */
export type PushPayload = { title: string; body?: string; url: string; tag: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
/** `gone` = inscrição expirada (404/410): a API apaga. */
export type PushResult = 'ok' | 'gone' | 'error';

export interface PushSender {
  readonly publicKey: string | null;
  send(target: PushTarget, payload: PushPayload): Promise<PushResult>;
}
export const PUSH_SENDER = Symbol('PUSH_SENDER');

/**
 * Prazo para o serviço de push responder (NPAC-71). Sem ele, um aparelho que não responde segurava o
 * envio até o sistema desistir da conexão, e os avisos seguintes esperavam atrás.
 */
export const PUSH_TIMEOUT_MS = 10_000;

/** Host do serviço de push (ex.: `web.push.apple.com`): o endpoint inteiro identifica o aparelho. */
function pushHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'endereço inválido';
  }
}

/**
 * Motivo que o serviço de push devolve (Apple: `{"reason":"BadDeviceToken"}`; Mozilla: `message`).
 * Texto solto vai cortado, sem endereços.
 */
export function pushReason(body: unknown): string {
  const text = typeof body === 'string' ? body : Buffer.isBuffer(body) ? body.toString() : '';
  if (!text.trim()) return '';
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const r = j.reason ?? j.message ?? j.error;
    if (typeof r === 'string') return r.slice(0, 120);
  } catch {
    // não é JSON
  }
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Web Push padrão (VAPID). Sem chaves no ambiente, não envia nada. Cada envio vai para o log com
 * o código HTTP, o host do serviço e o motivo da recusa (NPAC-48, B7: diagnosticar o iPhone), sem
 * o endpoint completo, sem o texto do aviso e sem dados da pessoa.
 */
export class WebPushSender implements PushSender {
  private readonly log = new Logger('Push');
  readonly publicKey: string | null;
  private readonly privateKey: string | null;
  private readonly subject: string;
  constructor(env: Env) {
    this.publicKey = env.VAPID_PUBLIC_KEY ?? null;
    this.privateKey = env.VAPID_PRIVATE_KEY ?? null;
    this.subject =
      env.VAPID_SUBJECT ??
      (env.WEB_ORIGIN.startsWith('https:') ? env.WEB_ORIGIN : 'mailto:crm@localhost');
  }
  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (!this.publicKey || !this.privateKey) return 'ok';
    const host = pushHost(target.endpoint);
    try {
      const res = await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          TTL: 60 * 60,
          urgency: 'high',
          timeout: PUSH_TIMEOUT_MS,
          vapidDetails: {
            subject: this.subject,
            publicKey: this.publicKey,
            privateKey: this.privateKey,
          },
        },
      );
      this.log.log(`push enviado: ${res.statusCode} ${host}`);
      return 'ok';
    } catch (e) {
      const err = e as { statusCode?: number; body?: unknown; code?: string; name?: string };
      if (err.statusCode === undefined) {
        // Sem resposta HTTP: rede, DNS, TLS ou tempo esgotado até o serviço de push.
        this.log.warn(`push sem resposta: ${err.code ?? err.name ?? 'erro'} ${host}`);
        return 'error';
      }
      const reason = pushReason(err.body);
      const line = `${err.statusCode} ${host}${reason ? ` ${reason}` : ''}`;
      if (err.statusCode === 404 || err.statusCode === 410) {
        this.log.log(`push expirado, inscrição apagada: ${line}`);
        return 'gone';
      }
      this.log.warn(`push recusado: ${line}`);
      return 'error';
    }
  }
}

@Injectable()
export class PushService {
  private readonly log = new Logger('Push');
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    private readonly crypto: FieldCrypto,
  ) {}

  publicKey() {
    return { publicKey: this.sender.publicKey };
  }

  async subscribe(userId: string, input: PushTarget, userAgent: string | null) {
    await withUser(this.db, userId, (tx) =>
      tx.execute(sql`select push_subscribe(${input.endpoint},
        ${this.crypto.encrypt(input.p256dh)}, ${this.crypto.encrypt(input.auth)}, ${userAgent})`),
    );
    return { ok: true };
  }

  /** A pessoa só enxerga as próprias inscrições (RLS): a de outra pessoa responde `false`. */
  async known(userId: string, endpoint: string) {
    const rows = await withUser(this.db, userId, (tx) =>
      tx.execute(sql`select 1 from push_subscriptions where endpoint = ${endpoint}`),
    );
    return { known: rows.length > 0 };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await withUser(this.db, userId, (tx) =>
      tx.execute(sql`delete from push_subscriptions where endpoint = ${endpoint}`),
    );
    return { ok: true };
  }

  /**
   * Manda o mesmo aviso aos aparelhos de cada pessoa. A leitura das inscrições é feita como a
   * própria pessoa (RLS). Falha de push não quebra nada: a tela continua avisando.
   * Os aparelhos recebem ao mesmo tempo e o envio acontece fora da transação (NPAC-71): em fila,
   * com a transação aberta, um aparelho lento atrasava os outros e segurava uma conexão do banco.
   */
  async notify(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.all(
      [...new Set(userIds)].map(async (uid) => {
        try {
          const subs = await withUser(this.db, uid, async (tx) => [
            ...(await tx.execute<{ endpoint: string; p256dh: Buffer; auth: Buffer }>(
              sql`select endpoint, p256dh, auth from push_subscriptions where user_id = ${uid}`,
            )),
          ]);
          const results = await Promise.all(subs.map((s) => this.sendTo(s, payload)));
          const gone = subs.filter((_, i) => results[i] === 'gone').map((s) => s.endpoint);
          if (gone.length)
            await withUser(this.db, uid, (tx) =>
              tx.execute(
                sql`delete from push_subscriptions where endpoint = any(${sql.param(gone)}::text[])`,
              ),
            );
        } catch (e) {
          // Sem payload no log: só o tipo do erro.
          this.log.warn(`falha ao enviar push: ${(e as Error).name}`);
        }
      }),
    );
  }

  /** Um aparelho. Erro aqui (chave ilegível, rede) fica só neste: os outros recebem. */
  private async sendTo(
    s: { endpoint: string; p256dh: Buffer; auth: Buffer },
    payload: PushPayload,
  ): Promise<PushResult> {
    try {
      return await this.sender.send(
        {
          endpoint: s.endpoint,
          p256dh: this.crypto.decrypt(s.p256dh),
          auth: this.crypto.decrypt(s.auth),
        },
        payload,
      );
    } catch (e) {
      this.log.warn(`falha ao enviar push: ${(e as Error).name}`);
      return 'error';
    }
  }
}
