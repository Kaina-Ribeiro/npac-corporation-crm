import { sql } from 'drizzle-orm';
import type { Db, Tx } from './client.js';

/**
 * Executa `fn` numa transação com `app.user_id` definido (escopo local à transação),
 * que é o que as políticas de RLS leem via `app_user_id()`.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Indica se já existe lead ativo (não excluído) com o mesmo blind index de telefone
 * ou o mesmo instagram — enxergando leads de todos os SDRs, apesar da RLS.
 */
export async function leadContactTaken(
  tx: Tx,
  bidx: string | null,
  instagram: string | null,
): Promise<boolean> {
  const rows = await tx.execute<{ taken: boolean }>(
    sql`select lead_contact_taken(${bidx}::text, ${instagram}::text) as taken`,
  );
  return rows[0]?.taken === true;
}
