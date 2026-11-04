'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const ABAS = [
  { href: '/acompanhamento/dashboard', label: 'Dashboard' },
  { href: '/acompanhamento/linha-do-tempo', label: 'Linha do tempo' },
  { href: '/acompanhamento/rdv', label: 'Linha do tempo RDV' },
  { href: '/acompanhamento/backup', label: 'Importação e backup' },
];

/** Abas do módulo (desktop e tablet). No celular, as abas ficam no rodapé (abas-mobile). */
export function AbasModulo() {
  const path = usePathname();
  return (
    <nav aria-label="Módulos do acompanhamento" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex w-max gap-1 rounded-2xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
        {ABAS.map((a) => {
          const on = path === a.href || path.startsWith(`${a.href}/`);
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                aria-current={on ? 'page' : undefined}
                className={`flex h-9 items-center rounded-xl px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  on
                    ? 'bg-[var(--on)] text-ink shadow-[inset_0_1px_0_#fff,0_2px_10px_rgba(0,0,0,.08)]'
                    : 'text-ink2 hover:bg-black/5 hover:text-ink active:scale-[.98] dark:hover:bg-white/10'
                }`}
              >
                {a.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
