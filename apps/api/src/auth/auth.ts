import { hash, verify } from '@node-rs/argon2';
import * as schema from '@npac/db';
import { user as userTable, type Db } from '@npac/db';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { eq } from 'drizzle-orm';
import type { AuditService } from '../audit/audit.service.js';
import type { Env } from '../config/env.js';

const SIGN_IN_PATHS = new Set(['/sign-in/email', '/two-factor/verify-totp']);

const reqMeta = (headers: Headers | undefined) => ({
  ip: headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
  userAgent: headers?.get('user-agent') ?? undefined,
});

/**
 * Auditoria de login/logout/troca de senha. É um plugin (e vem depois do twoFactor)
 * para enxergar o estado final: com MFA pendente o twoFactor zera `newSession`.
 */
function auditPlugin(db: Db, audit: AuditService): BetterAuthPlugin {
  return {
    id: 'npac-audit',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === '/sign-out',
          handler: createAuthMiddleware(async (ctx) => {
            const s = await getSessionFromCtx(ctx);
            if (!s) return;
            await audit.record({
              actorId: s.user.id,
              action: 'auth.sign_out',
              entityType: 'user',
              entityId: s.user.id,
              ...reqMeta(ctx.headers),
            });
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => SIGN_IN_PATHS.has(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            if (isAPIError(ctx.context.returned)) {
              await audit.record({
                actorId: null,
                action: 'auth.sign_in.failure',
                entityType: 'user',
                data: { step: ctx.path === '/sign-in/email' ? 'password' : 'totp' },
                ...reqMeta(ctx.headers),
              });
              return;
            }
            // verify-totp com sessão já aberta é a ativação do MFA, não um login.
            const created = ctx.context.newSession;
            if (!created || (ctx.path !== '/sign-in/email' && ctx.context.session)) return;
            await audit.record({
              actorId: created.user.id,
              action: 'auth.sign_in.success',
              entityType: 'user',
              entityId: created.user.id,
              ...reqMeta(ctx.headers),
            });
          }),
        },
        {
          matcher: (ctx) => ctx.path === '/change-password',
          handler: createAuthMiddleware(async (ctx) => {
            const uid = ctx.context.session?.user.id;
            if (isAPIError(ctx.context.returned) || !uid) return;
            await db
              .update(userTable)
              .set({ mustChangePassword: false })
              .where(eq(userTable.id, uid));
            await audit.record({
              actorId: uid,
              action: 'auth.password_changed',
              entityType: 'user',
              entityId: uid,
              ...reqMeta(ctx.headers),
            });
          }),
        },
      ],
    },
  };
}

export function createAuth(db: Db, env: Env, audit: AuditService) {
  return betterAuth({
    appName: 'NPAC Corporation',
    // Falhas de login já vão para a auditoria; nos testes o log do Better Auth só polui.
    logger: { disabled: env.NODE_ENV === 'test' },
    basePath: '/api/auth',
    baseURL: env.WEB_ORIGIN,
    trustedOrigins: [env.WEB_ORIGIN, ...env.EXTRA_TRUSTED_ORIGINS],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      password: {
        hash: (p) => hash(p),
        verify: ({ hash: h, password }) => verify(h, password),
      },
    },
    plugins: [twoFactor({ issuer: 'NPAC Corporation' }), auditPlugin(db, audit)],
    // 30 dias logado (cookie persistente); renova a validade uma vez por dia de uso.
    session: { expiresIn: 30 * 86_400, updateAge: 86_400 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },
    user: {
      additionalFields: {
        role: { type: 'string', input: false },
        canProspect: { type: 'boolean', input: false },
        canClose: { type: 'boolean', input: false },
        active: { type: 'boolean', input: false },
        mustChangePassword: { type: 'boolean', input: false },
      },
    },
    advanced: {
      // Secure sempre que o site é servido por https (produção, túnel); http local não grava Secure.
      useSecureCookies: env.WEB_ORIGIN.startsWith('https://'),
      // O controller sobrescreve este header com o IP visto pelo Fastify.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    databaseHooks: {
      session: {
        create: {
          // Usuário desativado não abre sessão.
          before: async (s) => {
            const [u] = await db
              .select({ active: userTable.active })
              .from(userTable)
              .where(eq(userTable.id, s.userId));
            return u?.active ? undefined : false;
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export const AUTH = Symbol('AUTH');
