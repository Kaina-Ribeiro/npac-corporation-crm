import { Inject, Injectable } from '@nestjs/common';
import type { Db } from '@npac/db';
import { sql } from 'drizzle-orm';
import {
  catchError,
  defer,
  EMPTY,
  exhaustMap,
  filter,
  from,
  map,
  share,
  timer,
  type Observable,
} from 'rxjs';
import { DB } from '../common/db/db.module.js';

/** Intervalo da leitura do contador (D2 do plano de desempenho). */
export const REVISION_POLL_MS = 2000;

/**
 * Canal ao vivo por contador global (desempenho, Fase 3, D2): o gatilho da migration 0062 soma 1 a
 * `app_revision.n` a cada transação que escreve em leads, tarefas, timeline, chat ou avisos. Este
 * serviço lê `n` com UM temporizador para o processo inteiro (não por aba) e emite quando muda.
 * O temporizador só corre enquanto há alguém ouvindo (`share` desliga com zero conexões).
 * Funciona com mais de um processo da API: cada um lê o mesmo contador.
 */
@Injectable()
export class RevisionService {
  readonly changes$: Observable<void>;

  constructor(@Inject(DB) private readonly db: Db) {
    this.changes$ = defer(() => {
      let last: string | undefined;
      return timer(0, REVISION_POLL_MS).pipe(
        // Banco fora numa rodada: pula, sem derrubar as conexões abertas.
        exhaustMap(() => from(this.read()).pipe(catchError(() => EMPTY))),
        filter((n) => {
          const changed = last !== undefined && n !== last;
          last = n;
          return changed;
        }),
        map(() => undefined),
      );
    }).pipe(share());
  }

  /** O valor atual do contador (texto: `bigint`). Fora da RLS de usuário: não é dado de domínio. */
  async read(): Promise<string> {
    const rows = await this.db.execute<{ n: string }>(sql`select n::text as n from app_revision`);
    return rows[0]!.n;
  }
}
