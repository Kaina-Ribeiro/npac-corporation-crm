'use client';
import type { MentoradoStatus } from '@npac/shared/mentoria';

const CARDS: { status: MentoradoStatus; label: string; ponto: string }[] = [
  { status: 'ENGAJADO', label: 'Engajados', ponto: 'bg-emerald-500' },
  { status: 'EM_ATENCAO', label: 'Em atenção', ponto: 'bg-amber-500' },
  { status: 'EM_RISCO', label: 'Em risco', ponto: 'bg-rose-500' },
];

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/**
 * Faixa de status (Módulo 1): cada card inteiro é o botão de filtro (ponto, rótulo e número na
 * mesma linha); clicar de novo tira o filtro. Selecionado = barra dourada na lateral. Os nomes
 * de quem está no grupo ficam abaixo, à vista também no celular; com zero, o número já diz.
 */
export function DashboardCards({
  contagem,
  nomes,
  filtro,
  onFiltro,
}: {
  contagem: Record<MentoradoStatus, number>;
  nomes: Record<MentoradoStatus, { id: string; nome: string }[]>;
  filtro: MentoradoStatus | null;
  onFiltro: (s: MentoradoStatus | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {CARDS.map((c) => {
        const n = contagem[c.status] ?? 0;
        const sel = filtro === c.status;
        const titulo = `card-${c.status}`;
        return (
          <section key={c.status} aria-labelledby={titulo} className="flex min-w-0 flex-col gap-2">
            <button
              type="button"
              id={titulo}
              aria-pressed={sel}
              onClick={() => onFiltro(sel ? null : c.status)}
              className={`glass-card card-click flex h-14 w-full items-center gap-2.5 px-4 text-left ${sel ? 'card-sel' : ''}`}
            >
              <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${c.ponto}`} />
              <span className={`truncate text-sm ${sel ? 'font-semibold text-ink' : 'text-ink2'}`}>
                {c.label}
              </span>
              <span className="ml-auto text-[22px] leading-none font-bold tracking-[-0.02em] tabular-nums">
                {n}
              </span>
            </button>
            {n > 0 && (
              <ul
                className="flex max-h-28 flex-wrap gap-1.5 overflow-x-hidden overflow-y-auto px-0.5"
                aria-label={`Nomes: ${c.label}`}
              >
                {(nomes[c.status] ?? []).map((m) => (
                  <li
                    key={m.id}
                    className="inline-flex h-7 max-w-full items-center gap-1.5 truncate rounded-full border border-line bg-white/60 pr-2.5 pl-1 text-[12.5px] font-medium whitespace-nowrap dark:bg-white/[0.06]"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex size-5 items-center justify-center rounded-full bg-black/[0.07] text-[10px] font-bold text-ink2 dark:bg-white/10"
                    >
                      {iniciais(m.nome)}
                    </span>
                    {m.nome}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
