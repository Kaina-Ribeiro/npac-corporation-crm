import { describe, expect, it } from 'vitest';
import { nextReminderChange, pendingReminder, reminderStep } from '../src/reminders.js';

const at = '2030-01-10T15:00:00.000Z';
const t = (minutesBefore: number) => new Date(at).getTime() - minutesBefore * 60_000;

describe('lembretes de reunião', () => {
  it('etapa vigente: 1 h, 15 min, 1 min; nada antes nem depois do início', () => {
    expect(reminderStep(at, t(61))).toBeNull();
    expect(reminderStep(at, t(60))).toBe('H1');
    expect(reminderStep(at, t(16))).toBe('H1');
    expect(reminderStep(at, t(15))).toBe('M15');
    expect(reminderStep(at, t(1))).toBe('M1');
    expect(reminderStep(at, t(0))).toBeNull();
  });
  it('confirmada some; 1 min é só aviso e não depende de confirmação', () => {
    expect(pendingReminder({ scheduledAt: at, confirmed: ['H1'] }, t(30))).toBeNull();
    expect(pendingReminder({ scheduledAt: at, confirmed: ['H1'] }, t(10))).toBe('M15');
    expect(pendingReminder({ scheduledAt: at, confirmed: ['H1', 'M15'] }, t(1))).toBe('M1');
  });
  it('próxima mudança', () => {
    expect(nextReminderChange(at, t(90))).toBe(t(60));
    expect(nextReminderChange(at, t(60))).toBe(t(15));
    expect(nextReminderChange(at, t(1))).toBe(t(0));
    expect(nextReminderChange(at, t(0))).toBeNull();
  });
});
