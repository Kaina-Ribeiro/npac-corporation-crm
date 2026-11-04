'use client';
import { useFieldSaver } from '@/lib/acompanhamento-saver';

const TEXTO = (status: string, n: number) =>
  status === 'saved'
    ? 'Tudo salvo'
    : status === 'saving'
      ? 'Salvando…'
      : status.startsWith('queued:')
        ? `Salvando ${n} na fila…`
        : status === 'unsaved'
          ? 'Não salvo: fique na página até salvar'
          : 'Não foi possível salvar';

/** "Tudo salvo / Salvando N na fila…" no topo do módulo (regra 2). Avisa conflito e erro. */
export function IndicadorSalvo() {
  const { status, pendentes, aviso, limparAviso } = useFieldSaver();
  const ok = status === 'saved';
  const ruim = status === 'error' || status === 'unsaved';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        role="status"
        className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold ${
          ruim
            ? 'bg-rose-500/12 text-rose-800 dark:text-rose-300'
            : ok
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
        }`}
      >
        <i
          aria-hidden="true"
          className={`size-2 rounded-full bg-current ${ok || ruim ? '' : 'animate-pulse'}`}
        />
        {TEXTO(status, pendentes)}
      </span>
      {aviso && (
        <span className="inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-xs text-ink2 dark:bg-white/10">
          {aviso}
          <button
            type="button"
            onClick={limparAviso}
            className="font-semibold text-ink underline-offset-2 hover:underline"
          >
            Ok
          </button>
        </span>
      )}
    </div>
  );
}
