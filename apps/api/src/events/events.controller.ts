import { Controller, Header, Inject, Query, Req, Sse } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { exhaustMap, filter, map, merge, takeWhile, tap, timer } from 'rxjs';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { AUTH, type Auth } from '../auth/auth.js';
import { toHeaders } from '../auth/headers.js';
import { RevisionService } from './revision.service.js';

type Signal = 'ready' | 'invalidate' | 'heartbeat' | 'session-ended' | 'access-required';
const END: Signal[] = ['session-ended', 'access-required'];

/** Intervalo da checagem de sessão por conexão (antes: a cada 2 s, junto com o resumo). */
export const SESSION_CHECK_MS = 10_000;

// O cargo Acompanhamento também precisa do aviso de sessão encerrada.
@AllRoles()
@Controller()
export class EventsController {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly revision: RevisionService,
  ) {}

  @Sse('events')
  @Header('Cache-Control', 'no-store')
  @Header('X-Accel-Buffering', 'no')
  events(@Req() req: FastifyRequest, @Query('rev') rev?: string) {
    // Só sai um sinal vazio: qualquer escrita (contador global, D2) vira `invalidate` para todas
    // as abas, que refazem a consulta sujeita à RLS. A sessão é conferida ao abrir e a cada 10 s;
    // nesse intervalo vai `heartbeat`. Ao abrir, a aba manda a revisão que o render entregou
    // (`/api/me`): igual à atual = `ready` (a tela já está em dia, não recarrega); diferente ou
    // ausente = `invalidate`.
    const rendered = typeof rev === 'string' && /^\d{1,19}$/.test(rev) ? rev : undefined;
    let ready = false;
    const status$ = timer(0, SESSION_CHECK_MS).pipe(
      exhaustMap(async (tick): Promise<Signal> => {
        const current = await this.auth.api.getSession({ headers: toHeaders(req) });
        if (!current || !current.user.active) return 'session-ended';
        if (current.user.mustChangePassword) return 'access-required';
        if (tick > 0) return 'heartbeat';
        return rendered !== undefined && rendered === (await this.revision.read())
          ? 'ready'
          : 'invalidate';
      }),
      tap((type) => {
        if (!END.includes(type)) ready = true;
      }),
    );
    const changes$ = this.revision.changes$.pipe(
      filter(() => ready),
      map((): Signal => 'invalidate'),
    );
    return merge(status$, changes$).pipe(
      map((type) => ({ data: { type } })),
      takeWhile((event) => !END.includes(event.data.type), true),
    );
  }
}
