import { Inject, Injectable } from '@nestjs/common';
import type { Db } from '@npac/db';
import { sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';

/** Precisão do "entrou há X" (spec NPAC-54, D12): uns 15 minutos bastam. */
export const ULTIMO_USO_INTERVALO_MS = 15 * 60_000;

/**
 * Última vez que a pessoa usou o sistema (M12: uso, não digitação da senha). A guarda de sessão
 * chama `marcar` em todo pedido autenticado; o banco só é tocado se esta instância não gravou nos
 * últimos 15 min, e o UPDATE ainda confere a data, para várias instâncias não gravarem juntas.
 * `user` não está no canal ao vivo (`app_revision`): gravar aqui não recarrega aba nenhuma.
 */
@Injectable()
export class UltimoUso {
  private readonly gravado = new Map<string, number>();

  constructor(@Inject(DB) private readonly db: Db) {}

  async marcar(userId: string, agora = Date.now()): Promise<void> {
    const antes = this.gravado.get(userId);
    if (antes !== undefined && agora - antes < ULTIMO_USO_INTERVALO_MS) return;
    this.gravado.set(userId, agora);
    try {
      await this.db.execute(sql`
        update "user" set ultimo_uso = now()
        where id = ${userId}
          and (ultimo_uso is null or ultimo_uso < now() - interval '15 minutes')`);
    } catch {
      // Não atrapalha o pedido; tenta de novo no próximo.
      this.gravado.delete(userId);
    }
  }
}
