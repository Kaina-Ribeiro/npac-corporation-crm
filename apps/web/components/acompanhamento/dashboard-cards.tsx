'use client';
import type { MentoradoStatus } from '@npac/shared/mentoria';

const CARDS: { status: MentoradoStatus; label: string; icone: string; cor: string }[] = [
  {
    status: 'ENGAJADO',
    label: 'Engajados',
    icone: 'M5 12l5 5L20 7',
    cor: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  },
  {
    status: 'EM_ATENCAO',
    label: 'Em atenção',
    icone: 'M12 8v5M12 17h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
    cor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  {
    status: 'EM_RISCO',
    label: 'Em risco',
    icone:
      'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
    cor: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  },
];

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/**
 * Cards por status (Módulo 1): contagem e os nomes de quem está em cada grupo, à vista também
 * no celular. Clicar no card filtra a tabela; clicar de novo tira o filtro.
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
    <div className="grid gap-3 md:grid-cols-3">
      {CARDS.map((c) => {
        const n = contagem[c.status] ?? 0;
        const sel = filtro === c.status;
        const titulo = `card-${c.status}`;
        return (
          <section
            key={c.status}
            aria-labelledby={titulo}
            className={`glass-card flex min-w-0 flex-col gap-3 p-4 transition-shadow ${sel ? 'ring-2 ring-ink/70' : ''}`}
          >
            <button
              type="button"
              id={titulo}
              aria-pressed={sel}
              onClick={() => onFiltro(sel ? null : c.status)}
              className="flex flex-col items-start gap-1 rounded-xl text-left transition-transform active:scale-[.99]"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink2">
                <span
                  className={`inline-flex size-7 items-center justify-center rounded-lg ${c.cor}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={c.icone} />
                  </svg>
                </span>
                {c.label}
              </span>
              <span className="text-[34px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                {n}
              </span>
              <span className="text-xs text-ink3">
                {n === 1 ? '1 mentorado' : `${n} mentorados`}
              </span>
            </button>
            {n === 0 ? (
              <p className="text-[13px] text-ink3">Ninguém neste status.</p>
            ) : (
              <ul
                className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto"
                aria-label={`Nomes: ${c.label}`}
              >
                {(nomes[c.status] ?? []).map((m) => (
                  <li
                    key={m.id}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white/60 pr-2.5 pl-1 text-[12.5px] font-medium dark:bg-white/[0.06]"
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
