'use client';
import type { NotificationsDTO } from '@npac/shared';
import { nextReminderChange, pendingReminder, type ReminderStep } from '@npac/shared/reminders';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { clientApi } from './client-api';

/**
 * Uma busca de /api/notifications por aba, compartilhada por selo dos Avisos, selo do Chat,
 * título da aba e lembretes. Recarrega só no aviso do SSE (crm:invalidate), sem polling.
 */
let data: NotificationsDTO | null = null;
let started = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function refreshAlerts(): Promise<void> {
  inflight ??= clientApi<NotificationsDTO>('/api/notifications')
    .then((r) => {
      data = r;
      emit();
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    window.addEventListener('crm:invalidate', () => void refreshAlerts());
    void refreshAlerts();
  }
  return () => listeners.delete(listener);
}

export function useAlerts(): NotificationsDTO | null {
  return useSyncExternalStore(
    subscribe,
    () => data,
    () => null,
  );
}

type Timed = { scheduledAt: string };

/**
 * Relógio do navegador para as etapas dos lembretes: re-renderiza só quando alguma etapa muda
 * (1 h, 15 min, 1 min, início), com um único timer — sem chamar a API.
 */
export function useReminderClock(items: readonly Timed[]): number {
  const [now, setNow] = useState(() => Date.now());
  const key = items.map((i) => i.scheduledAt).join(',');
  useEffect(() => {
    const current = Date.now();
    const next = Math.min(
      ...key
        .split(',')
        .filter(Boolean)
        .map((at) => nextReminderChange(at, current) ?? Infinity),
    );
    if (!Number.isFinite(next)) return;
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, next - current) + 50);
    return () => clearTimeout(t);
  }, [key, now]);
  return now;
}

/** Lembretes do usuário com a etapa que pede atenção agora. */
export function usePendingReminders(): {
  id: string;
  leadId: string;
  leadName: string;
  at: string;
  step: ReminderStep;
}[] {
  const alerts = useAlerts();
  const list = alerts?.reminders ?? [];
  const now = useReminderClock(list.map((r) => ({ scheduledAt: r.at })));
  return list.flatMap((r) => {
    const step = pendingReminder({ scheduledAt: r.at, confirmed: r.confirmed }, now);
    return step ? [{ id: r.id, leadId: r.leadId, leadName: r.leadName, at: r.at, step }] : [];
  });
}
