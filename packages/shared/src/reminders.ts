/**
 * Lembretes de confirmação da reunião (NPAC-26): 1 h e 15 min pedem "Confirmação enviada";
 * 1 min é só aviso. Mesmo cálculo na tela (relógio do navegador) e na API.
 */
export type ReminderStep = 'H1' | 'M15' | 'M1';
export type ReminderStepConfirm = 'H1' | 'M15';

export const REMINDER_MINUTES: Record<ReminderStep, number> = { H1: 60, M15: 15, M1: 1 };
export const REMINDER_LABEL: Record<ReminderStep, string> = {
  H1: '1 h antes',
  M15: '15 min antes',
  M1: '1 min antes',
};

const MIN = 60_000;

/** Etapa vigente no instante `now` (ms); nula antes de 1 h e depois do início. */
export function reminderStep(scheduledAt: string | Date, now: number): ReminderStep | null {
  const at = new Date(scheduledAt).getTime();
  if (now >= at) return null;
  if (now >= at - MIN) return 'M1';
  if (now >= at - 15 * MIN) return 'M15';
  if (now >= at - 60 * MIN) return 'H1';
  return null;
}

/** Etapa que ainda pede atenção: a vigente, menos a que já foi confirmada. */
export function pendingReminder(
  m: { scheduledAt: string | Date; confirmed: readonly ReminderStepConfirm[] },
  now: number,
): ReminderStep | null {
  const step = reminderStep(m.scheduledAt, now);
  if (!step || (step !== 'M1' && m.confirmed.includes(step))) return null;
  return step;
}

/** Próximo instante (ms) em que a etapa vigente muda; nulo depois do início. */
export function nextReminderChange(scheduledAt: string | Date, now: number): number | null {
  const at = new Date(scheduledAt).getTime();
  const marks = [at - 60 * MIN, at - 15 * MIN, at - MIN, at];
  return marks.find((t) => t > now) ?? null;
}
