// Acesso de emergência: redefine a senha pelo terminal do servidor quando ninguém da
// liderança consegue entrar (a Diretoria só é administrada pela própria Diretoria).
import { and, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import { account, auditLog, session, twoFactor, user } from './schema/index.js';

export interface ResetPasswordOptions {
  hashPassword(p: string): Promise<string>;
  password: string;
  /** Também desliga o autenticador (TOTP perdido). */
  resetMfa?: boolean;
}

/** Troca a senha, obriga trocá-la no próximo login, derruba as sessões e audita. */
export async function resetPassword(
  db: Db,
  username: string,
  opts: ResetPasswordOptions,
): Promise<{ userId: string }> {
  const passwordHash = await opts.hashPassword(opts.password);
  const mfa = opts.resetMfa === true;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(user)
      .set({
        mustChangePassword: true,
        updatedAt: new Date(),
        ...(mfa ? { twoFactorEnabled: false } : {}),
      })
      .where(eq(user.username, username.trim().toLowerCase()))
      .returning({ id: user.id });
    if (!row) throw new Error('Usuário não encontrado');
    const updated = await tx
      .update(account)
      .set({ password: passwordHash })
      .where(and(eq(account.userId, row.id), eq(account.providerId, 'credential')))
      .returning({ id: account.id });
    if (updated.length === 0) throw new Error('Usuário sem login por senha');
    await tx.delete(session).where(eq(session.userId, row.id));
    if (mfa) await tx.delete(twoFactor).where(eq(twoFactor.userId, row.id));
    await tx.insert(auditLog).values({
      actorId: null,
      action: 'cli.user.reset_password',
      entityType: 'user',
      entityId: row.id,
      data: { mfa },
    });
    return { userId: row.id };
  });
}
