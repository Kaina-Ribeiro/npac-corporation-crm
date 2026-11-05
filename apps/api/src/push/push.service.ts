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

/** Web Push padrão (VAPID). Sem chaves no ambiente, não envia nada. */
export class WebPushSender implements PushSender {
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
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          TTL: 60 * 60,
          urgency: 'high',
          vapidDetails: {
            subject: this.subject,
            publicKey: this.publicKey,
            privateKey: this.privateKey,
          },
        },
      );
      return 'ok';
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? 'gone' : 'error';
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

  async unsubscribe(userId: string, endpoint: string) {
    await withUser(this.db, userId, (tx) =>
      tx.execute(sql`delete from push_subscriptions where endpoint = ${endpoint}`),
    );
    return { ok: true };
  }

  /**
   * Manda o mesmo aviso aos aparelhos de cada pessoa. A leitura das inscrições é feita como a
   * própria pessoa (RLS). Falha de push não quebra nada: a tela continua avisando.
   */
  async notify(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.all(
      [...new Set(userIds)].map(async (uid) => {
        try {
          await withUser(this.db, uid, async (tx) => {
            const subs = await tx.execute<{ endpoint: string; p256dh: Buffer; auth: Buffer }>(
              sql`select endpoint, p256dh, auth from push_subscriptions where user_id = ${uid}`,
            );
            for (const s of subs) {
              const result = await this.sender.send(
                {
                  endpoint: s.endpoint,
                  p256dh: this.crypto.decrypt(s.p256dh),
                  auth: this.crypto.decrypt(s.auth),
                },
                payload,
              );
              if (result === 'gone')
                await tx.execute(
                  sql`delete from push_subscriptions where endpoint = ${s.endpoint}`,
                );
            }
          });
        } catch (e) {
          // Sem payload no log: só o tipo do erro.
          this.log.warn(`falha ao enviar push: ${(e as Error).name}`);
        }
      }),
    );
  }
}
