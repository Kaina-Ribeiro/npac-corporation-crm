'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { baixarBackup } from '@/lib/acompanhamento-download';

/** Evento do "+" do rodapé: cada tela abre o próprio cadastro. */
export const EVENTO_MAIS = 'acompanhamento:mais';

const svg = (d: string) => (
  <svg
    viewBox="0 0 24 24"
    className="size-[22px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);
const ABAS = [
  {
    href: '/acompanhamento/dashboard',
    label: 'Dashboard',
    icone: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  },
  {
    href: '/acompanhamento/linha-do-tempo',
    label: 'Linha',
    icone: 'M4 6h16M4 12h10M4 18h7M18 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  },
  { href: '/acompanhamento/rdv', label: 'RDV', icone: 'M4 19h16M6 15l4-5 3 3 5-7' },
  {
    href: '/acompanhamento/backup',
    label: 'Backup',
    icone: 'M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  },
];

/**
 * Celular (abaixo de 768 px): abas Dashboard · Linha · + · RDV · Backup no rodapé, no lugar da
 * barra do CRM. O "+" abre o cadastro da aba atual (Colar planilha, Nova ficha, Novo mentorado)
 * e, no Backup, exporta o .json do Dashboard.
 */
export function AbasMobile() {
  const path = usePathname();
  const router = useRouter();
  const aba =
    ABAS.find((a) => path === a.href || path.startsWith(`${a.href}/`))?.label ?? 'Dashboard';
  const rotuloMais =
    aba === 'Linha'
      ? 'Nova ficha'
      : aba === 'RDV'
        ? 'Novo mentorado'
        : aba === 'Backup'
          ? 'Exportar .json'
          : 'Colar planilha';

  function mais() {
    if (aba === 'Backup') return void baixarBackup('dashboard').catch(() => {});
    // Dentro da ficha, a lista é que tem o cadastro: volta para ela já com o cadastro aberto.
    if (aba === 'Linha' && path !== '/acompanhamento/linha-do-tempo')
      return router.push('/acompanhamento/linha-do-tempo?nova=1');
    window.dispatchEvent(new CustomEvent(EVENTO_MAIS, { detail: aba }));
  }

  const item = (a: (typeof ABAS)[number]) => {
    const on = a.label === aba;
    return (
      <Link
        key={a.href}
        href={a.href}
        aria-current={on ? 'page' : undefined}
        className={`flex flex-col items-center justify-center gap-0.5 rounded-[28px] text-[10px] font-medium transition-all active:scale-95 ${
          on
            ? 'bg-[var(--on)] font-semibold text-ink shadow-[inset_0_1px_0_#fff,0_2px_10px_rgba(0,0,0,.08)]'
            : 'text-ink2'
        }`}
      >
        {svg(a.icone)}
        {a.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Abas do acompanhamento"
      className="glass fixed right-3.5 bottom-[max(16px,env(safe-area-inset-bottom))] left-3.5 z-20 grid h-[68px] grid-cols-5 rounded-[34px] p-1.5 md:hidden"
    >
      {item(ABAS[0]!)}
      {item(ABAS[1]!)}
      <button
        type="button"
        onClick={mais}
        aria-label={rotuloMais}
        className="mx-auto flex size-14 items-center justify-center self-center rounded-full bg-ink text-[var(--bg)] shadow-[0_8px_20px_-8px_rgba(0,0,0,.5)] transition-transform active:scale-90"
      >
        {svg('M12 5v14M5 12h14')}
      </button>
      {item(ABAS[2]!)}
      {item(ABAS[3]!)}
    </nav>
  );
}
