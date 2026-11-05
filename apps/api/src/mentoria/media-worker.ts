import type { INestApplicationContext } from '@nestjs/common';
import type { Db } from '@npac/db';
import { sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { MEDIA_STORE, type MediaStore } from './media-store.js';

/**
 * Worker da fila de exclusão de mídia (regra 7): sem sessão de usuário. Entra no role
 * npac_media_worker (só ele executa as funções da fila), apaga o arquivo do volume e marca
 * `removido_em`. Devolve quantos arquivos saíram. Modelo: runRetention.
 */
export async function apagarPendentes(db: Db, store: MediaStore, limite = 100): Promise<number> {
  const pendentes = await db.transaction(async (tx) => {
    await tx.execute(sql`set local role npac_media_worker`);
    return (await tx.execute(
      sql`select id, chave_objeto from mentoria_midia_fila_pendente(${limite})`,
    )) as unknown as { id: number; chave_objeto: string }[];
  });
  let n = 0;
  for (const p of pendentes) {
    await store.delete(p.chave_objeto);
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local role npac_media_worker`);
      await tx.execute(sql`select mentoria_midia_marcar_removida(${p.id})`);
    });
    n += 1;
  }
  return n;
}

export const rodarWorkerDeMidia = (app: INestApplicationContext) =>
  apagarPendentes(app.get<Db>(DB), app.get<MediaStore>(MEDIA_STORE));
