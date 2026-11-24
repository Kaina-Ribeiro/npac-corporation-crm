import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { user, withUser, type Db } from '@npac/db';
import { eq, sql } from 'drizzle-orm';
import type { TelegramStatusDTO as TelegramStatus } from '@npac/shared/profile';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { ENV, type Env } from '../config/env.js';
import type { PushPayload } from '../push/push.service.js';
import {
  TELEGRAM_SENDER,
  TELEGRAM_TEXTO,
  telegramHtml,
  type TelegramButton,
  type TelegramSender,
} from './telegram.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest();
/** O id do chat também vira índice cego (um Telegram por pessoa), com prefixo próprio. */
const chatBidx = (crypto: FieldCrypto, chatId: string) => crypto.blindIndex(`telegram:${chatId}`);

/** Código do link: 32 bytes em base64url (43 caracteres; o `start` do Telegram aceita até 64). */
const CODIGO = /^[\w-]{43}$/;
const START = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/;

/** O que interessa de um `Update` do Telegram; o resto é ignorado. */
type Update = {
  message?: { chat?: { id?: unknown; type?: unknown }; text?: unknown };
};

/**
 * Avisos pelo Telegram (NPAC-74): cada pessoa conecta o próprio Telegram pelo Meu perfil e recebe lá
 * os mesmos avisos do push. Sem as três variáveis, desligado: o perfil não mostra e as rotas dão 404.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly log = new Logger('Telegram');
  readonly enabled: boolean;
  private readonly bot: string;
  private readonly secret: string;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(TELEGRAM_SENDER) private readonly sender: TelegramSender,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
  ) {
    this.enabled = !!(
      env.TELEGRAM_BOT_TOKEN &&
      env.TELEGRAM_BOT_USERNAME &&
      env.TELEGRAM_WEBHOOK_SECRET
    );
    this.bot = env.TELEGRAM_BOT_USERNAME ?? '';
    this.secret = env.TELEGRAM_WEBHOOK_SECRET ?? '';
  }

  /** Registra o webhook ao subir: o Telegram só alcança endereço `https:` público. */
  onApplicationBootstrap() {
    if (!this.enabled || !this.env.WEB_ORIGIN.startsWith('https:')) return;
    void this.sender.setWebhook(`${this.env.WEB_ORIGIN}/api/webhooks/telegram`, this.secret);
  }

  assertEnabled() {
    if (!this.enabled) throw new NotFoundException();
  }

  /** Segredo do cabeçalho antes de olhar o corpo; sem configuração ou errado, 404. */
  assertSecret(given: string | undefined) {
    if (!this.enabled || !given || !timingSafeEqual(sha256(given), sha256(this.secret)))
      throw new NotFoundException();
  }

  /** Para o Meu perfil: `null` quando desligado. */
  async profile(userId: string): Promise<TelegramStatus | null> {
    return this.enabled ? this.status(userId) : null;
  }

  async status(userId: string): Promise<TelegramStatus> {
    const rows = await withUser(this.db, userId, (tx) =>
      tx.execute<{ criado_em: Date | string }>(
        sql`select criado_em from telegram_vinculos where user_id = ${userId}`,
      ),
    );
    const at = rows[0]?.criado_em;
    return { connected: !!at, since: at ? new Date(at).toISOString() : null };
  }

  /** Novo código (o anterior da pessoa deixa de valer) e o link do bot. */
  async code(userId: string): Promise<{ url: string; expiresAt: string }> {
    const codigo = randomBytes(32).toString('base64url');
    const rows = await withUser(this.db, userId, (tx) =>
      tx.execute<{ vence: Date | string }>(sql`select telegram_codigo(${sha256(codigo)}) as vence`),
    );
    return {
      url: `https://t.me/${this.bot}?start=${codigo}`,
      expiresAt: new Date(rows[0]!.vence).toISOString(),
    };
  }

  async disconnect(userId: string): Promise<void> {
    await withUser(this.db, userId, async (tx) => {
      const r = await tx.execute(
        sql`delete from telegram_vinculos where user_id = ${userId} returning 1`,
      );
      if (r.length)
        await this.audit.record(
          {
            actorId: userId,
            action: 'user.telegram_disconnected',
            entityType: 'user',
            entityId: userId,
          },
          tx,
        );
    });
  }

  /** Aviso de teste do perfil: só o Telegram (o aparelho tem o dele em "Avisos neste aparelho"). */
  async test(userId: string): Promise<void> {
    const chat = await this.chatOf(userId);
    if (!chat) throw new ConflictException('Conecte o Telegram antes do teste.');
    const r = await this.deliver(userId, chat, TELEGRAM_TEXTO.teste);
    if (r === 'gone') throw new ConflictException('Conecte o Telegram antes do teste.');
    if (r !== 'ok')
      throw new HttpException('Não deu para falar com o Telegram. Tente de novo.', 502);
  }

  /**
   * O mesmo aviso do push (chamado por `PushService.notify`), a quem tem vínculo. O vínculo é lido como
   * a própria pessoa (RLS), a transação fecha antes de falar com o Telegram e cada pessoa vai em
   * paralelo. Falha aqui nunca atrapalha o push nem a tela.
   */
  async notify(userIds: string[], payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    await Promise.all(
      [...new Set(userIds)].map(async (uid) => {
        try {
          const chat = await this.chatOf(uid);
          if (chat) await this.deliver(uid, chat, payload);
        } catch (e) {
          this.log.warn(`falha ao enviar telegram: ${(e as Error).name}`);
        }
      }),
    );
  }

  /** Mensagem do webhook. Só `/start` em chat privado; o resto é ignorado. Nada vai para log. */
  async receive(body: unknown): Promise<void> {
    const msg = (body as Update | null)?.message;
    const chatId = msg?.chat?.id;
    if (msg?.chat?.type !== 'private' || typeof msg.text !== 'string') return;
    if (typeof chatId !== 'number' && typeof chatId !== 'string') return;
    const m = START.exec(msg.text.trim());
    if (!m) return;
    const chat = String(chatId);
    const codigo = m[1];
    if (!codigo) {
      await this.sender.send(chat, TELEGRAM_TEXTO.semCodigo);
      return;
    }
    const uid = CODIGO.test(codigo) ? await this.connect(codigo, chat) : null;
    if (!uid) {
      await this.sender.send(chat, TELEGRAM_TEXTO.linkInvalido);
      return;
    }
    const [eu] = await this.db.select({ name: user.name }).from(user).where(eq(user.id, uid));
    const primeiro = (eu?.name ?? '').trim().split(/\s+/)[0] ?? '';
    await this.sender.send(chat, TELEGRAM_TEXTO.conectado(primeiro));
  }

  /** Troca o código pelo vínculo (função do banco, sem sessão). Devolve a pessoa ou `null`. */
  private async connect(codigo: string, chat: string): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      const rows = await tx.execute<{ uid: string | null }>(
        sql`select telegram_conectar(${sha256(codigo)}, ${this.crypto.encrypt(chat)},
          ${chatBidx(this.crypto, chat)}) as uid`,
      );
      const uid = rows[0]?.uid ?? null;
      if (uid)
        await this.audit.record(
          { actorId: uid, action: 'user.telegram_connected', entityType: 'user', entityId: uid },
          tx,
        );
      return uid;
    });
  }

  private async chatOf(userId: string): Promise<string | null> {
    const rows = await withUser(this.db, userId, (tx) =>
      tx.execute<{ chat_enc: Buffer }>(
        sql`select chat_enc from telegram_vinculos where user_id = ${userId}`,
      ),
    );
    return rows[0] ? this.crypto.decrypt(rows[0].chat_enc) : null;
  }

  private async deliver(userId: string, chat: string, payload: PushPayload) {
    const r = await this.sender.send(chat, telegramHtml(payload), this.button(payload.url));
    // Bloqueou o bot: o vínculo sai (conectar de novo cria outro).
    if (r === 'gone')
      await withUser(this.db, userId, (tx) =>
        tx.execute(sql`delete from telegram_vinculos where user_id = ${userId}`),
      );
    return r;
  }

  private button(url: string): TelegramButton | undefined {
    if (!this.env.WEB_ORIGIN.startsWith('https:')) return undefined;
    return { text: TELEGRAM_TEXTO.botao, url: new URL(url, this.env.WEB_ORIGIN).toString() };
  }
}
