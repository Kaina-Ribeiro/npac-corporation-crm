'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ICONES, Icone } from './ui';

const ABAS = [
  { href: '/acompanhamento/fila', label: 'Fila', icone: ICONES.fila },
  { href: '/acompanhamento/mentorados', label: 'Mentorados', icone: ICONES.mentorados },
  { href: '/acompanhamento/reunioes', label: 'Reuniões', icone: ICONES.reunioes },
  { href: '/acompanhamento/mais', label: 'Mais', icone: 'M5 12h.01M12 12h.01M19 12h.01' },
];

/** Qual aba do rodapé fica marcada: a ficha é da lista; o resto do módulo vive no Mais. */
function abaAtual(path: string): string | null {
  if (!path.startsWith('/acompanhamento')) return null;
  if (path.startsWith('/acompanhamento/fila')) return 'Fila';
  if (path.startsWith('/acompanhamento/reunioes')) return 'Reuniões';
  if (path.startsWith('/acompanhamento/mentorados') || path.startsWith('/acompanhamento/ficha'))
    return 'Mentorados';
  return 'Mais';
}

/**
 * Celular (abaixo de 768 px): Fila · Mentorados · + · Reuniões · Mais. O "+" abre a Nova inscrição
 * e não aparece para quem não cadastra; a própria tela de cadastro esconde o rodapé.
 */
export function AbasMobile({ podeCriar = false }: { podeCriar?: boolean }) {
  const path = usePathname();
  if (path === '/acompanhamento/mentorados/nova') return null;
  const aba = abaAtual(path);

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
        <Icone d={a.icone} className="size-[22px]" />
        {a.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Abas do acompanhamento"
      className={`glass fixed right-3.5 bottom-[max(16px,env(safe-area-inset-bottom))] left-3.5 z-20 grid h-[68px] rounded-[34px] p-1.5 md:hidden ${
        podeCriar ? 'grid-cols-5' : 'grid-cols-4'
      }`}
    >
      {item(ABAS[0]!)}
      {item(ABAS[1]!)}
      {podeCriar && (
        <Link
          href="/acompanhamento/mentorados/nova"
          aria-label="Nova inscrição"
          className="mx-auto flex size-14 items-center justify-center self-center rounded-full bg-ink text-[var(--bg)] shadow-[0_8px_20px_-8px_rgba(0,0,0,.5)] active:scale-90"
        >
          <Icone d={ICONES.mais} className="size-[22px]" largura={2} />
        </Link>
      )}
      {item(ABAS[2]!)}
      {item(ABAS[3]!)}
    </nav>
  );
}
