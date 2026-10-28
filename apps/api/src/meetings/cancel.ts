import { ConflictException } from '@nestjs/common';
import type { Tx } from '@npac/db';
import { sql } from 'drizzle-orm';

/** Comando SQL restrito: cancelar pode revogar a própria política SELECT do closer. */
export async function cancelMeeting(tx: Tx, id: string, version: number): Promise<void> {
  const rows = await tx.execute<{ changed: boolean }>(
    sql`select cancel_meeting(${id}::uuid, ${version}::integer) as changed`,
  );
  if (!rows[0]?.changed) throw new ConflictException({ code: 'VERSION_CONFLICT' });
}
