import {
  Inject,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Db } from '@npac/db';
import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { tap, type Observable } from 'rxjs';
import { DB } from '../common/db/db.module.js';
import { PushService, type PushPayload } from '../push/push.service.js';
import { MAX_DELAY } from '../push/reminders.js';
import { MENTORIA_CLOCK, type Clock } from './relogio.js';

/** Sem dado pessoal: o push passa pelos servidores do Google e da Apple (§5, §9). */
export const AVISO_PAYLOAD: PushPayload = {
  title: 'Acompanhamento',
  body: 'Novos itens na Fila do dia',
  url: '/acompanhamento/fila',
  tag: 'mentoria-fila',
};

/** Push das 8h ao cargo Envios (NPAC-56, M6): sem nome, só quando há algo a enviar. */
export const ENVIOS_PAYLOAD: PushPayload = {
  title: 'Tem envio para hoje',
  body: 'Envios físicos',
  url: '/acompanhamento/envios',
  tag: 'mentoria-envios',
};

/** Chaves do push das 8h dos envios (`envios:<dia>`, 0078). */
const ENVIOS_CHAVE = 'envios:';

/** Se o próximo já venceu logo depois de um disparo (outra instância com o lock), espera 1 s. */
const RETRY_DELAY = 1000;

/**
 * Despertador do push da Fila (§5, D10), no desenho do `ReminderScheduler`: um único timer para o
 * próximo aviso, sem polling. Rearma ao subir a API e depois de cada escrita do módulo
 * (`AvisosRearme`). Duplicidade entre instâncias é barrada no banco (`mentoria_aviso_reclamar`).
 * Também grava o histórico do semáforo (Fase 2, Parte 3): o timer acorda na virada da semana
 * (segunda 00:00 de Brasília) e, a cada disparo, `mentoria_semaforo_gravar` completa as semanas que
 * faltam (idempotente; ao subir a API, recupera as que passaram com ela parada). Parte 4: cobrança,
 * semáforo vermelho e degraus de atraso do PME (`mentoria_avisos_candidatos`, 0070); o timer acorda
 * também às 8h de todo dia.
 */
@Injectable()
export class AvisosScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('AvisosMentoria');
  private timer: unknown = null;
  /** Próximo disparo armado (ms), para testes e diagnóstico. */
  armedAt: number | null = null;
  private chain: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly push: PushService,
    @Inject(MENTORIA_CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap() {
    // Envia o que venceu com a API parada (uma vez) e arma o próximo.
    void this.fire();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.disarm();
  }

  /** Recalcula o próximo aviso. Não lança: falha só vai para o log. */
  rearm(): Promise<void> {
    return this.enqueue(() => this.arm(false));
  }

  /** Grava o semáforo das semanas encerradas, dispara os avisos vencidos e rearma. */
  fire(): Promise<void> {
    return this.enqueue(async () => {
      await this.gravarSemaforo();
      await this.claimAndSend();
      await this.arm(true);
    });
  }

  /** Espera o que estiver em andamento (testes). */
  settled(): Promise<void> {
    return this.chain;
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(async () => {
      if (this.stopped) return;
      try {
        await job();
      } catch (e) {
        this.log.warn(`falha no despertador: ${(e as Error).message}`);
      }
    });
    return this.chain;
  }

  private disarm() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.armedAt = null;
  }

  private async arm(afterFire: boolean) {
    this.disarm();
    const now = this.clock.now();
    const ts = sql`${new Date(now).toISOString()}::timestamptz`;
    // Além do próximo aviso: a virada da semana (histórico do semáforo) e as 8h de Brasília de todo
    // dia, porque o semáforo pode virar vermelho só com a troca do dia, sem escrita que rearme (E18).
    const rows = await this.db.execute<{ at: Date | string | null }>(
      sql`select least(mentoria_aviso_proximo(${ts}),
        (date_trunc('week', ${ts} at time zone 'America/Sao_Paulo') + interval '7 days')
          at time zone 'America/Sao_Paulo',
        mentoria_hora(mentoria_dia(${ts} - interval '8 hours') + 1, 8)) as at`,
    );
    const next = rows[0]?.at;
    if (!next || this.stopped) return;
    const armed = this.clock.now();
    let delay = new Date(next).getTime() - armed;
    if (delay <= 0 && afterFire) delay = RETRY_DELAY;
    delay = Math.min(Math.max(delay, 0), MAX_DELAY);
    this.armedAt = armed + delay;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.fire();
    }, delay);
  }

  /** Histórico semanal do semáforo; falha só vai para o log e não segura o push. */
  private async gravarSemaforo() {
    try {
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
        new Date(this.clock.now()),
      );
      await this.db.execute(sql`select mentoria_semaforo_gravar(${hoje}::date)`);
    } catch (e) {
      this.log.warn(`falha no histórico do semáforo: ${(e as Error).message}`);
    }
  }

  /** Um push por pessoa, mesmo com vários avisos vencidos (API parada: uma vez só). */
  private async claimAndSend() {
    const now = new Date(this.clock.now()).toISOString();
    const due = await this.db.execute<{ chave: string; user_ids: string[] }>(
      sql`select * from mentoria_aviso_reclamar(${now}::timestamptz)`,
    );
    const de = (envios: boolean) => [
      ...new Set(
        due.filter((r) => r.chave.startsWith(ENVIOS_CHAVE) === envios).flatMap((r) => r.user_ids),
      ),
    ];
    const fila = de(false);
    const envios = de(true);
    if (fila.length) await this.push.notify(fila, AVISO_PAYLOAD);
    if (envios.length) await this.push.notify(envios, ENVIOS_PAYLOAD);
  }
}

/** Depois de cada escrita do módulo, o despertador recalcula o próximo aviso. */
@Injectable()
export class AvisosRearme implements NestInterceptor {
  constructor(private readonly avisos: AvisosScheduler) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metodo = ctx.switchToHttp().getRequest<FastifyRequest>().method;
    return next.handle().pipe(
      tap(() => {
        if (metodo !== 'GET') void this.avisos.rearm();
      }),
    );
  }
}
