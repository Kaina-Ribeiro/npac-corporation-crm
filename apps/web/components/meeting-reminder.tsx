'use client';
import { REMINDER_LABEL, pendingReminder, type ReminderStep } from '@npac/shared/reminders';
import { useState } from 'react';
import { refreshAlerts, useReminderClock } from '@/lib/alerts';
import { clientApi } from '@/lib/client-api';

const hourMinute = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Lembrete de confirmação da reunião (NPAC-26): 1 h e 15 min pedem "Confirmação enviada";
 * 1 min é só aviso. A etapa vem do relógio do navegador; a API só grava a confirmação.
 */
export function ReminderNotice({
  meetingId,
  leadName,
  scheduledAt,
  step,
  onConfirmed,
}: {
  meetingId: string;
  leadName: string;
  scheduledAt: string;
  step: ReminderStep;
  onConfirmed?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urgent = step === 'M1';
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await clientApi(`/api/meetings/${meetingId}/confirm`, 'POST', { step });
      await Promise.all([refreshAlerts(), onConfirmed?.()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      role="status"
      data-reminder={step}
      className={`reminder-pop flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 text-sm ${
        urgent
          ? 'bg-danger/10 text-ink ring-1 ring-danger/25'
          : 'bg-[color-mix(in_srgb,var(--viz-1)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--viz-1)_30%,transparent)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 flex-none rounded-full ${urgent ? 'animate-pulse bg-danger' : 'bg-[var(--viz-1)]'}`}
      />
      <span className="min-w-0 flex-1">
        {urgent ? (
          <>
            Reunião com <b className="font-semibold">{leadName}</b> começa em 1 min
          </>
        ) : (
          <>
            Mande a confirmação para <b className="font-semibold">{leadName}</b> (
            {hourMinute.format(new Date(scheduledAt))}){' '}
            <span className="text-ink2">· {REMINDER_LABEL[step]}</span>
          </>
        )}
      </span>
      {!urgent && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-[var(--bg)] transition-[transform,opacity] hover:opacity-90 active:scale-[.97] disabled:opacity-50 md:min-h-9"
        >
          Confirmação enviada
        </button>
      )}
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Lembrete de uma reunião do Hoje, quando a pessoa é dona do lead. */
export function MeetingReminder({
  meetingId,
  leadName,
  scheduledAt,
  confirmed,
  onConfirmed,
}: {
  meetingId: string;
  leadName: string;
  scheduledAt: string;
  confirmed: ('H1' | 'M15')[];
  onConfirmed?: () => void | Promise<void>;
}) {
  const now = useReminderClock([{ scheduledAt }]);
  const step = pendingReminder({ scheduledAt, confirmed }, now);
  if (!step) return null;
  return (
    <ReminderNotice
      meetingId={meetingId}
      leadName={leadName}
      scheduledAt={scheduledAt}
      step={step}
      onConfirmed={onConfirmed}
    />
  );
}
