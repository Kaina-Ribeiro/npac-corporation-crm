'use client';
import { useState, type FormEvent } from 'react';
import { brasiliaInput } from '@/lib/client-api';
import { button, control, Field, quietButton } from './crm-ui';

type Mode = 'menu' | 'RESCHEDULED' | 'NEXT_ACTION';

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
  const chip = `${quietButton} min-h-11 transition-[transform,background-color] hover:bg-black/5 active:scale-[.97] dark:hover:bg-white/10`;
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
  if (!mode)
    return (
      <button type="button" className={chip} disabled={busy} onClick={() => setMode('menu')}>
        Ação rápida
      </button>
    );
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
