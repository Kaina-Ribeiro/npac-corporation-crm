'use client';
import type { LeadCatalog } from '@npac/shared';
import { stageFieldsKind } from '@/lib/stage-kind';

const barSelect =
  'h-9 rounded-xl border border-line bg-[var(--on)] px-2.5 text-sm font-medium text-ink disabled:opacity-50';

/**
 * Barra de ações em massa da lista de Leads. Só baixa quando a pessoa marca o primeiro lead (fora
 * da primeira carga de /leads, limite de 150 KB).
 */
export function LeadsBulkBar({
  count,
  catalog,
  canAssign,
  busy,
  message,
  onStage,
  onSdr,
  onCloser,
  onClear,
}: {
  count: number;
  catalog: LeadCatalog;
  canAssign: boolean;
  busy: boolean;
  message: string;
  onStage: (key: string) => void;
  onSdr: (id: string) => void;
  onCloser: (id: string) => void;
  onClear: () => void;
}) {
  const bar = (
    label: string,
    placeholder: string,
    options: [string, string][],
    run: (v: string) => void,
  ) => (
    <select
      aria-label={label}
      value=""
      disabled={busy}
      onChange={(e) => run(e.target.value)}
      className={barSelect}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
  return (
    <section
      aria-label="Ações em massa"
      className="glass fixed right-3.5 bottom-[calc(max(16px,env(safe-area-inset-bottom))+80px)] left-3.5 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl p-2.5 shadow-[0_14px_34px_-14px_rgba(0,0,0,.35)] md:bottom-6 md:left-[calc(var(--side-w)+32px)] md:transition-[left] md:duration-[var(--side-t)] md:ease-[var(--side-ease)]"
    >
      <b className="px-2 text-sm">
        {count} {count === 1 ? 'selecionado' : 'selecionados'}
      </b>
      {bar(
        'Mover para etapa',
        'Mover para…',
        // Venda só entra registrando a venda, lead a lead. Agendados e Agendou Pagamento pedem
        // dados de cada lead (reunião, pagamento): só na ficha, no Pipeline ou na célula (2A).
        catalog.stages
          .filter(
            (st) => st.key !== 'VENDA' && !['MEETING', 'PAYMENT'].includes(stageFieldsKind(st.key)),
          )
          .map((st) => [st.key, st.label]),
        onStage,
      )}
      {canAssign &&
        bar(
          'Trocar SDR',
          'SDR…',
          catalog.team.filter((u) => u.canProspect).map((u) => [u.id, u.name]),
          onSdr,
        )}
      {canAssign &&
        bar(
          'Trocar closer',
          'Closer…',
          catalog.team.filter((u) => u.canClose).map((u) => [u.id, u.name]),
          onCloser,
        )}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto h-9 rounded-xl px-3 text-sm font-semibold text-ink2 hover:bg-black/5"
      >
        Limpar
      </button>
      {message && (
        <p role="status" className="w-full px-2 text-xs text-ink2">
          {message}
        </p>
      )}
    </section>
  );
}
