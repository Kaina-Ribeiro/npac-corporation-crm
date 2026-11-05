'use client';
import type { LeadCatalog } from '@npac/shared';
import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from './crm-ui';

type Stage = LeadCatalog['stages'][number];

/**
 * Liderança edita as colunas do pipeline (pedido do cliente, 04/11/2026): cria, renomeia,
 * reordena e exclui. Colunas de sistema (Venda, No-show…) só renomeiam e mudam de lugar.
 */
export function PipelineColumnsEditor({
  stages,
  onChanged,
}: {
  stages: Stage[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, delta: -1 | 1) {
    const ids = stages.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    void run(() => clientApi('/api/admin/stages/order', 'POST', { ids }));
  }
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const label = String(new FormData(form).get('label') ?? '').trim();
    if (!label) return;
    void run(async () => {
      await clientApi('/api/admin/stages', 'POST', { label });
      form.reset();
    });
  }
  const icon = `${quietButton} min-h-11 min-w-11 hover:bg-black/5 dark:hover:bg-white/10`;
  return (
    <section aria-label="Editar colunas" className="glass-card flex flex-col gap-3 p-4">
      <h2 className="text-base font-bold">Editar colunas</h2>
      <p className="text-xs text-ink2">
        O nome salva ao sair do campo. Colunas usadas pelo sistema podem mudar de nome e de lugar,
        mas não podem ser excluídas.
      </p>
      <ol className="flex flex-col gap-2" aria-busy={busy}>
        {stages.map((s, i) => (
          <li
            key={`${s.id}:${s.label}`}
            data-label={s.label}
            data-system={s.system ? '' : undefined}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 sm:flex-nowrap"
          >
            <input
              aria-label="Nome da coluna"
              defaultValue={s.label}
              maxLength={60}
              disabled={busy}
              className={`${control} min-w-0 flex-1 basis-40`}
              onBlur={(e) => {
                const label = e.currentTarget.value.trim();
                if (label && label !== s.label)
                  void run(() => clientApi(`/api/admin/stages/${s.id}`, 'PATCH', { label }));
              }}
            />
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                className={icon}
                aria-label="Mover para cima"
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={icon}
                aria-label="Mover para baixo"
                disabled={busy || i === stages.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={`${icon} px-3 text-red-700 disabled:text-ink3 dark:text-red-400`}
                aria-label={s.system ? 'Excluir coluna (usada pelo sistema)' : 'Excluir coluna'}
                title={s.system ? 'Usada pelo sistema: não pode ser excluída' : undefined}
                disabled={busy || s.system}
                onClick={() => {
                  if (window.confirm(`Excluir a coluna "${s.label}"?`))
                    void run(() => clientApi(`/api/admin/stages/${s.id}`, 'DELETE'));
                }}
              >
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ol>
      <form className="flex flex-wrap items-center gap-2" onSubmit={add}>
        <input
          name="label"
          aria-label="Nova coluna"
          placeholder="Nome da nova coluna"
          maxLength={60}
          required
          className={`${control} min-w-0 flex-1 basis-48`}
        />
        <button className={`${button} min-h-11`} disabled={busy}>
          Adicionar coluna
        </button>
      </form>
      <FormError message={error} />
    </section>
  );
}
