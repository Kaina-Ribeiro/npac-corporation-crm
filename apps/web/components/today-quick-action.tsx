'use client';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { brasiliaInput } from '@/lib/client-api';
import { button, control, Field, quietButton } from './crm-ui';

type Mode = 'menu' | 'RESCHEDULED' | 'NEXT_ACTION';

/**
 * Gatilho das ações rápidas do Hoje: ícone de raio. Em quem tem mouse aparece ao passar sobre a
 * linha (ou com foco do teclado); no toque fica sempre visível.
 */
function Trigger({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Ação rápida"
      title="Ação rápida"
      disabled={busy}
      onClick={onClick}
      className="grid size-9 flex-none place-items-center rounded-full text-ink2 transition-[opacity,transform,background-color,color] duration-150 hover:bg-black/[.06] hover:text-ink active:scale-90 disabled:opacity-40 dark:hover:bg-white/10 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 [@media(hover:hover)]:group-focus-within/row:opacity-100 [&_svg]:size-[18px]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z" />
      </svg>
    </button>
  );
}

/**
 * Ação rápida de um contato do Hoje (pedido do cliente, 04/11/2026): Chamado tira da lista,
 * Remarcado pede a nova data, Próxima ação vira tarefa com prazo. Horários em Brasília.
 */
export function QuickAction({
  version,
  busy,
  run,
}: {
  version: number;
  busy: boolean;
  run: (body: object) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const chip = `${quietButton} min-h-11 transition-[transform,background-color] hover:bg-black/5 active:scale-[.97] dark:hover:bg-white/10 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-[var(--bg)]`;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const at = brasiliaInput(String(form.get('at') ?? ''));
    void run(
      mode === 'NEXT_ACTION'
        ? { version, action: mode, at, title: String(form.get('title') ?? '') }
        : { version, action: mode, at },
    );
  }
  if (!mode) return <Trigger busy={busy} onClick={() => setMode('menu')} />;
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-black/[.03] p-3 dark:bg-white/5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ação rápida">
        <button
          type="button"
          className={chip}
          disabled={busy}
          onClick={() => void run({ version, action: 'CALLED' })}
        >
          Chamado
        </button>
        <button
          type="button"
          className={chip}
          aria-pressed={mode === 'RESCHEDULED'}
          disabled={busy}
          onClick={() => setMode('RESCHEDULED')}
        >
          Remarcado
        </button>
        <button
          type="button"
          className={chip}
          aria-pressed={mode === 'NEXT_ACTION'}
          disabled={busy}
          onClick={() => setMode('NEXT_ACTION')}
        >
          Próxima ação
        </button>
        <button
          type="button"
          className="min-h-11 px-3 text-sm text-ink2 hover:text-ink"
          onClick={() => setMode(null)}
        >
          Fechar
        </button>
      </div>
      {mode !== 'menu' && (
        <form key={mode} className="flex flex-wrap items-end gap-2" onSubmit={submit}>
          {mode === 'NEXT_ACTION' && (
            <Field label="O que fazer">
              <input name="title" required maxLength={200} className={control} />
            </Field>
          )}
          <Field label={mode === 'NEXT_ACTION' ? 'Prazo' : 'Nova data'}>
            <input name="at" type="datetime-local" required className={control} />
          </Field>
          <button className={`${button} min-h-11`} disabled={busy}>
            Salvar
          </button>
        </form>
      )}
    </div>
  );
}

const hourMinute = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Ação rápida de uma reunião do Hoje (pedido do cliente, 04/11/2026): Realizada e No-show sempre
 * visíveis, bloqueados até o horário (a API recusa antes) e liberados sozinhos com a tela aberta;
 * Remarcar pede o novo horário (Brasília) e move a reunião.
 */
export function MeetingAction({
  version,
  scheduledAt,
  busy,
  outcome,
  reschedule,
}: {
  version: number;
  scheduledAt: string;
  busy: boolean;
  outcome: (body: { version: number; outcome: 'DONE' | 'NO_SHOW' }) => Promise<void>;
  reschedule: (body: { version: number; scheduledAt?: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'menu' | 'RESCHEDULE' | null>(null);
  const hintId = useId();
  const at = new Date(scheduledAt).getTime();
  const [started, setStarted] = useState(() => at <= Date.now());
  // Relógio só enquanto o menu está aberto e a reunião não começou (sem chamar a API).
  useEffect(() => {
    if (!mode || started) return;
    const tick = () => {
      if (at <= Date.now()) setStarted(true);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [mode, started, at]);
  const chip = `${quietButton} min-h-11 transition-[transform,background-color] hover:bg-black/5 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 dark:hover:bg-white/10 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-[var(--bg)]`;
  if (!mode) return <Trigger busy={busy} onClick={() => setMode('menu')} />;
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl bg-black/[.03] p-3 dark:bg-white/5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ação rápida da reunião">
        <button
          type="button"
          className={chip}
          disabled={busy || !started}
          aria-describedby={started ? undefined : hintId}
          onClick={() => void outcome({ version, outcome: 'DONE' })}
        >
          Realizada
        </button>
        <button
          type="button"
          className={chip}
          disabled={busy || !started}
          aria-describedby={started ? undefined : hintId}
          onClick={() => void outcome({ version, outcome: 'NO_SHOW' })}
        >
          No-show
        </button>
        <button
          type="button"
          className={chip}
          aria-pressed={mode === 'RESCHEDULE'}
          disabled={busy}
          onClick={() => setMode('RESCHEDULE')}
        >
          Remarcar
        </button>
        <button
          type="button"
          className="min-h-11 px-3 text-sm text-ink2 hover:text-ink"
          onClick={() => setMode(null)}
        >
          Fechar
        </button>
      </div>
      {!started && (
        <p id={hintId} className="text-xs text-ink2">
          Realizada e No-show liberam às {hourMinute.format(at)}, horário da reunião.
        </p>
      )}
      {mode === 'RESCHEDULE' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const at = brasiliaInput(String(new FormData(e.currentTarget).get('at') ?? ''));
            void reschedule({ version, scheduledAt: at });
          }}
        >
          <Field label="Novo horário">
            <input name="at" type="datetime-local" required className={control} />
          </Field>
          <button className={`${button} min-h-11`} disabled={busy}>
            Salvar
          </button>
        </form>
      )}
    </div>
  );
}
