import { Controller, Header, Inject, Req, Sse } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { exhaustMap, interval, startWith, takeWhile } from 'rxjs';
import { AUTH, type Auth } from '../auth/auth.js';
import { toHeaders } from '../auth/headers.js';
import { DB } from '../common/db/db.module.js';

type Signal = 'ready' | 'invalidate' | 'heartbeat' | 'session-ended' | 'access-required';

@Controller()
export class EventsController {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Sse('events')
  @Header('Cache-Control', 'no-store')
  @Header('X-Accel-Buffering', 'no')
  events(@Req() req: FastifyRequest) {
    let previous: string | undefined;
    // O banco é a fonte dos eventos: funciona com mais de um processo da API.
    // Só sai um sinal vazio; cada consumidor refaz a consulta sujeita à RLS.
    return interval(2000).pipe(
      startWith(0),
      exhaustMap(async () => {
        const current = await this.auth.api.getSession({ headers: toHeaders(req) });
        let type: Signal;
        if (!current || !current.user.active) type = 'session-ended';
        else if (
          current.user.mustChangePassword ||
          (current.user.role === 'HEAD' && !current.user.twoFactorEnabled)
        )
          type = 'access-required';
        else {
          const digest = await withUser(this.db, current.user.id, async (tx) => {
            const rows = await tx.execute<{ revision: string }>(sql`
            select md5(
              coalesce((select string_agg(id::text || ':' || version::text, ',' order by id) from leads where deleted_at is null), '') || '/' ||
              coalesce((select string_agg(id::text || ':' || version::text, ',' order by id) from lead_tasks), '') || '/' ||
              coalesce((select count(*)::text || ':' || max(at)::text from lead_timeline), '') || '/' ||
              coalesce((select max(id)::text from chat_messages), '') || '/' ||
              coalesce((select count(*)::text from chat_channels), '') || '/' ||
              coalesce((select string_agg(channel_id::text || ':' || last_read_id::text, ',' order by channel_id) from chat_reads), '')
            ) as revision`);
            return rows[0]!.revision;
          });
          type =
            previous === undefined ? 'ready' : previous !== digest ? 'invalidate' : 'heartbeat';
          previous = digest;
        }
        return { data: { type } };
      }),
      takeWhile((event) => !['session-ended', 'access-required'].includes(event.data.type), true),
    );
  }
}
