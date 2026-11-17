import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { withUser, type Db, type DbClient } from '@npac/db';
import { activityVerb } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { DB, DB_SQL } from '../common/db/db.module.js';
import { PushService, type PushPayload } from './push.service.js';

/** Canal do NOTIFY do gatilho `notifications_push` (0065). */
export const AVISO_CHANNEL = 'npac_aviso';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Claimed = {
  notification_id: string;
  user_id: string;
  kind: string;
  actor_name: string;
  lead_id: string;
  timeline_id: string;
};

/**
 * Texto do push = a linha do sino ("Ana agendou João Silva"): primeiro nome de quem fez, o verbo
 * e o nome do lead. Nunca telefone, Instagram, e-mail ou valor.
 */
export function avisoPayload(
  kind: string,
  actorName: string,
  leadId: string,
  leadName: string | null,
  timelineId: string,
): PushPayload {
  return {
    title: `${actorName.split(' ')[0]} ${activityVerb(kind)} ${leadName ?? 'um lead fora do seu acesso'}`,
    url: leadName ? `/leads/${leadId}` : '/avisos',
    tag: `aviso-${timelineId}`,
  };
}

/**
 * Push de todo aviso do sino (NPAC-48, pedido do Igor, 17/11/2026), para quem recebeu o aviso.
 * Sem polling: o INSERT em `notifications` faz NOTIFY no commit e esta classe, ouvindo numa
 * conexão própria (LISTEN do postgres-js, que reconecta sozinho), reivindica o aviso em
 * `notification_push_claim`, que garante um push por aviso entre instâncias. Ao conectar (subir a
 * API ou reconectar), manda o que ficou sem push nos últimos 10 min. Nada aqui grava em tabela
 * vigiada pelo `app_revision` (laço de avisos).
 */
@Injectable()
export class SinoPush implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Push do sino');
  private readonly pending = new Set<string>();
  private recover = false;
  private queued = false;
  private chain: Promise<void> = Promise.resolve();
  private unlisten: (() => Promise<void>) | null = null;
  private stopped = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(DB_SQL) private readonly pg: DbClient['sql'],
    private readonly push: PushService,
  ) {}

  onApplicationBootstrap() {
    return this.start();
  }

  onModuleDestroy() {
    return this.stop();
  }

  /** Começa a ouvir. O `onlisten` roda a cada conexão: recupera o que ficou para trás. */
  async start() {
    this.stopped = false;
    try {
      const sub = await this.pg.listen(
        AVISO_CHANNEL,
        (id) => this.queue(id),
        () => this.queue(null),
      );
      this.unlisten = sub.unlisten;
    } catch (e) {
      this.log.warn(`sem LISTEN dos avisos: ${(e as Error).message}`);
    }
  }

  async stop() {
    this.stopped = true;
    const unlisten = this.unlisten;
    this.unlisten = null;
    if (unlisten) await unlisten().catch(() => undefined);
    await this.chain;
  }

  /** Espera os envios em andamento (testes). */
  settled(): Promise<void> {
    return this.chain;
  }

  /** `null` = recuperar os últimos 10 min. Junta o que chegar enquanto um envio roda. */
  private queue(id: string | null) {
    if (id === null) this.recover = true;
    else if (UUID.test(id)) this.pending.add(id);
    else return;
    if (this.queued) return;
    this.queued = true;
    this.chain = this.chain.then(() => this.drain());
  }

  private async drain() {
    this.queued = false;
    const recover = this.recover;
    const ids = [...this.pending];
    this.recover = false;
    this.pending.clear();
    if (this.stopped || (!recover && !ids.length)) return;
    try {
      const rows = await this.db.execute<Claimed>(
        recover
          ? sql`select * from notification_push_claim(null::uuid[])`
          : sql`select * from notification_push_claim(string_to_array(${ids.join(',')}, ',')::uuid[])`,
      );
      // Só a contagem: confere no log que o caminho banco → API funciona (ITODEV, produção).
      if (rows.length) this.log.log(`avisos do sino para push: ${rows.length}`);
      await Promise.all(rows.map((r) => this.send(r)));
    } catch (e) {
      this.log.warn(`falha no push do sino: ${(e as Error).message}`);
    }
  }

  /** O nome do lead é lido como a pessoa (RLS): fora do acesso dela, o push não traz o nome. */
  private async send(r: Claimed) {
    try {
      const leadName = await withUser(this.db, r.user_id, async (tx) => {
        const [lead] = await tx.execute<{ name: string }>(
          sql`select name from leads where id = ${r.lead_id}
            and deleted_at is null and anonymized_at is null`,
        );
        return lead?.name ?? null;
      });
      await this.push.notify(
        [r.user_id],
        avisoPayload(r.kind, r.actor_name, r.lead_id, leadName, r.timeline_id),
      );
    } catch (e) {
      this.log.warn(`falha no push do sino: ${(e as Error).name}`);
    }
  }
}
