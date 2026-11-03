import { hash } from '@node-rs/argon2';
import { accessRequests, user, type Db } from '@npac/db';
import { accessRequestSchema } from '@npac/shared';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { eq, lt, or } from 'drizzle-orm';
import type { AuditService } from '../audit/audit.service.js';

/** Pedido sem resposta some depois disso. */
export const ACCESS_REQUEST_TTL_DAYS = 7;
export const REQUEST_ACCESS_PATH = '/request-access';

/** Pedidos criados antes disso estão expirados. */
export const accessRequestCutoff = () =>
  new Date(Date.now() - ACCESS_REQUEST_TTL_DAYS * 86_400_000);

/**
 * Pedido de acesso na tela de login. É endpoint do Better Auth para herdar o rate limit em banco.
 * A resposta é sempre a mesma: não revela se o usuário já tem conta ou pedido.
 */
export function requestAccessPlugin(db: Db, audit: AuditService): BetterAuthPlugin {
  return {
    id: 'npac-request-access',
    endpoints: {
      requestAccess: createAuthEndpoint(
        REQUEST_ACCESS_PATH,
        { method: 'POST', body: accessRequestSchema },
        async (ctx) => {
          const { name, username, email, password } = ctx.body;
          await db
            .delete(accessRequests)
            .where(lt(accessRequests.createdAt, accessRequestCutoff()));
          // Hash sempre, antes de olhar o usuário: o tempo de resposta não revela quem tem conta.
          const passwordHash = await hash(password);
          // Usuário ou e-mail já cadastrado: nada a aprovar (a aprovação daria 409).
          const [taken] = await db
            .select({ id: user.id })
            .from(user)
            .where(or(eq(user.username, username), eq(user.email, email)));
          if (!taken) {
            const [created] = await db
              .insert(accessRequests)
              .values({ name, username, email, passwordHash })
              .onConflictDoNothing({ target: accessRequests.username })
              .returning({ id: accessRequests.id });
            if (created)
              await audit.record({
                actorId: null,
                action: 'access_request.create',
                entityType: 'access_request',
                entityId: created.id,
                ip: ctx.headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
              });
          }
          return ctx.json({ ok: true as const });
        },
      ),
    },
  };
}
