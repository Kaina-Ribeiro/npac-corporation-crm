import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { account, session, user, verification, type Db } from '@npac/db';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { and, eq, gt, like, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuditService } from '../audit/audit.service.js';
import type { MailSender } from '../mail/mail.js';
import { resetPasswordMail } from '../mail/templates.js';

export const FORGOT_PATH = '/forgot-password';
export const FORGOT_STATUS_PATH = '/forgot-password/status';
export const RESET_PATH = '/forgot-password/reset';
export const CHECK_PATH = '/forgot-password/check';
/** O link vale 1 hora; a conta recebe no máximo 3 por hora (o IP também: rate limit da rota). */
export const RESET_TTL_MS = 60 * 60_000;
export const RESET_MAX_PER_ACCOUNT = 3;
/** Piso do tempo de resposta do pedido: com ou sem conta, a resposta sai no mesmo tempo. */
export const FORGOT_MIN_MS = 400;
/** Só o hash do link fica no banco: quem lê a tabela não consegue usá-lo. */
const PREFIX = 'npac-reset:';
const digest = (token: string) => PREFIX + createHash('sha256').update(token).digest('hex');

const ipOf = (headers: Headers | undefined) =>
  headers?.get('x-forwarded-for')?.split(',')[0]?.trim();

const INVALID = {
  code: 'INVALID_TOKEN',
  message: 'Este link venceu ou já foi usado. Peça outro.',
};

/** Dono de um link ainda válido, se a conta estiver ativa; senão `null` (vencido, usado ou desativada). */
async function linkOwner(db: Db, id: string) {
  const [v] = await db
    .select({ userId: verification.value })
    .from(verification)
    .where(and(eq(verification.identifier, id), gt(verification.expiresAt, new Date())));
  if (!v) return null;
  const [u] = await db
    .select({ id: user.id, username: user.username, active: user.active })
    .from(user)
    .where(eq(user.id, v.userId));
  return u?.active && u.username ? { id: u.id, username: u.username } : null;
}

/**
 * "Esqueci minha senha" por e-mail. Endpoints do Better Auth para herdar o rate limit em banco.
 * O pedido aceita usuário ou e-mail, responde igual (e no mesmo tempo) exista ou não a conta e
 * manda o link `/login/nova-senha#t=<token>` (o fragmento não vai a servidor nenhum). A troca
 * consome o link, derruba todas as sessões da conta e devolve o usuário para a tela entrar. A tela
 * confere o link ao abrir (`/check`) para mostrar o usuário ("Para o usuário ana") ou "Link vencido".
 * Os caminhos do próprio Better Auth (`/request-password-reset`, `/reset-password`) ficam desligados.
 */
export function passwordResetPlugin(
  db: Db,
  audit: AuditService,
  mail: MailSender,
  webOrigin: string,
): BetterAuthPlugin {
  return {
    id: 'npac-password-reset',
    endpoints: {
      forgotPasswordStatus: createAuthEndpoint(FORGOT_STATUS_PATH, { method: 'GET' }, (ctx) =>
        Promise.resolve(ctx.json({ enabled: mail.enabled })),
      ),
      forgotPassword: createAuthEndpoint(
        FORGOT_PATH,
        { method: 'POST', body: z.object({ login: z.string().trim().min(1).max(200) }) },
        async (ctx) => {
          if (!mail.enabled) throw APIError.from('NOT_FOUND', { code: 'NOT_FOUND', message: '' });
          const started = Date.now();
          const login = ctx.body.login.toLowerCase();
          const [u] = await db
            .select({ id: user.id, name: user.name, email: user.email, active: user.active })
            .from(user)
            .where(
              login.includes('@') ? sql`lower(${user.email}) = ${login}` : eq(user.username, login),
            )
            .limit(1);
          await db
            .delete(verification)
            .where(
              and(
                like(verification.identifier, `${PREFIX}%`),
                lt(verification.expiresAt, new Date()),
              ),
            );
          const token = randomBytes(32).toString('base64url');
          // Conta desativada ou sem e-mail não recebe; a resposta é a mesma.
          const issued =
            !!u?.active &&
            !!u.email &&
            (await db.transaction(async (tx) => {
              // Dois pedidos ao mesmo tempo não passam juntos do limite da conta.
              await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${PREFIX + u.id}))`);
              const [row] = await tx
                .select({ n: sql<number>`count(*)::int` })
                .from(verification)
                .where(
                  and(
                    eq(verification.value, u.id),
                    like(verification.identifier, `${PREFIX}%`),
                    gt(verification.createdAt, new Date(Date.now() - RESET_TTL_MS)),
                  ),
                );
              if ((row?.n ?? 0) >= RESET_MAX_PER_ACCOUNT) return false;
              await tx.insert(verification).values({
                id: randomUUID(),
                identifier: digest(token),
                value: u.id,
                expiresAt: new Date(Date.now() + RESET_TTL_MS),
              });
              await audit.record(
                {
                  actorId: null,
                  action: 'auth.password_reset.requested',
                  entityType: 'user',
                  entityId: u.id,
                  ip: ipOf(ctx.headers),
                },
                tx,
              );
              return true;
            }));
          if (issued && u) {
            // Sem await: o envio (segundos no SMTP) não pode alongar só a resposta de quem existe.
            void mail.send(
              resetPasswordMail(
                u.email,
                u.name,
                `${webOrigin}/login/nova-senha#t=${token}`,
                '1 hora',
              ),
            );
          }
          const wait = FORGOT_MIN_MS - (Date.now() - started);
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          return ctx.json({ ok: true as const });
        },
      ),
      checkResetLink: createAuthEndpoint(
        CHECK_PATH,
        { method: 'POST', body: z.object({ token: z.string().min(16).max(200) }) },
        async (ctx) => {
          const owner = await linkOwner(db, digest(ctx.body.token));
          if (!owner) throw APIError.from('BAD_REQUEST', INVALID);
          return ctx.json({ username: owner.username });
        },
      ),
      resetPassword: createAuthEndpoint(
        RESET_PATH,
        {
          method: 'POST',
          body: z.object({ token: z.string().min(16).max(200), newPassword: z.string() }),
        },
        async (ctx) => {
          const { token, newPassword } = ctx.body;
          const { minPasswordLength, maxPasswordLength } = ctx.context.password.config;
          if (newPassword.length < minPasswordLength)
            throw APIError.from('BAD_REQUEST', {
              code: 'PASSWORD_TOO_SHORT',
              message: `A senha precisa de pelo menos ${minPasswordLength} caracteres.`,
            });
          if (newPassword.length > maxPasswordLength)
            throw APIError.from('BAD_REQUEST', {
              code: 'PASSWORD_TOO_LONG',
              message: `A senha pode ter até ${maxPasswordLength} caracteres.`,
            });
          const id = digest(token);
          const u = await linkOwner(db, id);
          if (!u) throw APIError.from('BAD_REQUEST', INVALID);
          const passwordHash = await ctx.context.password.hash(newPassword);
          const done = await db.transaction(async (tx) => {
            // Uso único: só um pedido consegue apagar a linha (o outro espera e apaga zero).
            const consumed = await tx
              .delete(verification)
              .where(and(eq(verification.identifier, id), gt(verification.expiresAt, new Date())))
              .returning({ id: verification.id });
            if (consumed.length === 0) return false;
            // Outros links ainda abertos da mesma conta morrem junto.
            await tx
              .delete(verification)
              .where(
                and(eq(verification.value, u.id), like(verification.identifier, `${PREFIX}%`)),
              );
            const updated = await tx
              .update(account)
              .set({ password: passwordHash, updatedAt: new Date() })
              .where(and(eq(account.userId, u.id), eq(account.providerId, 'credential')))
              .returning({ id: account.id });
            if (updated.length === 0)
              await tx.insert(account).values({
                id: randomUUID(),
                accountId: u.id,
                providerId: 'credential',
                userId: u.id,
                password: passwordHash,
              });
            // Senha escolhida pela própria pessoa: não pede outra troca no primeiro acesso.
            await tx.update(user).set({ mustChangePassword: false }).where(eq(user.id, u.id));
            // Derruba todas as sessões abertas (outro aparelho, quem pegou a senha antiga).
            await tx.delete(session).where(eq(session.userId, u.id));
            await audit.record(
              {
                actorId: u.id,
                action: 'auth.password_reset',
                entityType: 'user',
                entityId: u.id,
                ip: ipOf(ctx.headers),
              },
              tx,
            );
            return true;
          });
          if (!done) throw APIError.from('BAD_REQUEST', INVALID);
          return ctx.json({ ok: true as const, username: u.username });
        },
      ),
    },
  };
}
