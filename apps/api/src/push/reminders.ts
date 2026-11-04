import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Db } from '@npac/db';
import { sql } from 'drizzle-orm';
import type { ReminderStep } from '@npac/shared';
import { DB } from '../common/db/db.module.js';
import { PushService, type PushPayload } from './push.service.js';

/** Relógio trocável nos testes (o padrão é o do Node). */
export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};
export const REMINDER_CLOCK = Symbol('REMINDER_CLOCK');
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** setTimeout aceita no máximo ~24,8 dias; além disso arma um timer que só recalcula. */
export const MAX_DELAY = 2 ** 31 - 1;
/** Se o próximo já venceu logo depois de um disparo (outra instância segurando o lock), espera 1 s. */
const RETRY_DELAY = 1000;

const hourMinute = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

/** Texto do push: só horário e nome do lead (mesma regra do Google Agenda). */
export function reminderPayload(
  step: ReminderStep,
  meetingId: string,
  scheduledAt: Date,
  leadName: string,
): PushPayload {
  const tag = `meeting-${meetingId}`;
  if (step === 'M1')
    return { title: `Reunião com ${leadName} começa em 1 min`, url: '/avisos', tag };
  return {
    title: `Reunião às ${hourMinute.format(scheduledAt)}: mande a confirmação para ${leadName}`,
    body: step === 'H1' ? '1 h antes' : '15 min antes',
    url: '/avisos',
    tag,
  };
}

/**
 * "Despertador" dos lembretes de reunião (decisão de 04/11/2026, sem polling): um único timer
 * armado para o próximo lembrete pendente. Rearma ao iniciar a API e depois de cada evento que
 * muda reuniões (criar, remarcar, cancelar, resultado, transferir lead). Duplicidade entre
 * instâncias é barrada no banco (`meeting_reminder_claim`).
 */
@Injectable()
export class ReminderScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('Lembretes');
  private timer: unknown = null;
  /** Próximo disparo armado (ms), para testes e diagnóstico. */
  armedAt: number | null = null;
  private chain: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly push: PushService,
    @Inject(REMINDER_CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap() {
    // Envia o que venceu com a API parada (uma vez) e arma o próximo.
    void this.fire();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.disarm();
  }

  /** Recalcula o próximo lembrete. Não lança: falha só vai para o log. */
  rearm(): Promise<void> {
    return this.enqueue(() => this.arm(false));
  }

  /** Dispara as etapas vencidas e rearma. */
  fire(): Promise<void> {
    return this.enqueue(async () => {
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
    const rows = await this.db.execute<{ at: Date | string | null }>(
      sql`select meeting_reminder_next(${new Date(now).toISOString()}::timestamptz) as at`,
    );
    const next = rows[0]?.at;
    if (!next || this.stopped) return;
    // Atraso medido depois da consulta: o timer cai no horário exato da etapa.
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

  private async claimAndSend() {
    const now = new Date(this.clock.now()).toISOString();
    const due = await this.db.execute<{
      meeting_id: string;
      step: ReminderStep;
      scheduled_at: Date | string;
      sdr_id: string;
      lead_name: string;
    }>(sql`select * from meeting_reminder_claim(${now}::timestamptz)`);
    await Promise.all(
      due.map((r) =>
        this.push.notify(
          [r.sdr_id],
          reminderPayload(r.step, r.meeting_id, new Date(r.scheduled_at), r.lead_name),
        ),
      ),
    );
  }
}
