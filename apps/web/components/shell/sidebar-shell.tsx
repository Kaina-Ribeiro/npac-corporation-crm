'use client';
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { SIDEBAR_COOKIE, SIDEBAR_EVENT } from '@/lib/sidebar';

// Enxuto de propósito: entra no JS de todas as telas (/leads tem teto de 150 KB gzip).
const Collapse = createContext<[boolean, () => void]>([false, () => {}]);
/** Tablet em pé (768 a 1023 px, 4A do Chat): a sidebar fica recolhida e o botão abre. */
// Sintaxe curta (teto de JS); navegador sem ela fica como no computador (aberta depois do JS).
const ehTablet = () => matchMedia('(48em<=width<64em)').matches;
const ouvir = (f: () => void) => (
  addEventListener('resize', f),
  () => removeEventListener('resize', f)
);

/**
 * Casca do app: guarda se a sidebar está recolhida (cookie, para o servidor já renderizar
 * assim), atende Ctrl/⌘+B e mostra o nome dos itens num tooltip quando ela vira trilho.
 * No tablet em pé ela fica recolhida sem mexer no cookie (antes do JS, pelo CSS de globals.css);
 * depois do JS, aberta vira `data-side="open"` e escolher uma tela recolhe de novo.
 */
export function SidebarShell({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [escolha, setCollapsed] = useState(initialCollapsed);
  const [aberta, setAberta] = useState(false);
  // `null` no servidor e na hidratação: aí vale o CSS (recolhida no tablet, antes do JS).
  const tablet = useSyncExternalStore<boolean | null>(ouvir, ehTablet, () => null);
  const collapsed = tablet ? !aberta : escolha;
  const [tip, setTip] = useState<{ text: string; top: number; left: number }>();
  const toggle = () => (ehTablet() ? setAberta((a) => !a) : setCollapsed((c) => !c));

  useEffect(() => {
    setTip(undefined);
    document.cookie = `${SIDEBAR_COOKIE}=${+escolha}; Path=/; Max-Age=31536000; SameSite=Lax`;
    // `escolha` só muda fora do tablet, onde ela é o próprio `collapsed`.
  }, [collapsed]);

  // Carga direta numa tela do fim do menu com a janela baixa: a lista rola até o item ativo.
  useEffect(() => {
    document
      .querySelector('.side-scroll [aria-current=page]')
      ?.scrollIntoView({ block: 'nearest' });
  }, []);

  useEffect(() => {
    // `toggle` só usa os setters e o `ehTablet`: o da primeira renderização serve.
    const onKey = (e: KeyboardEvent) => {
      // Só no desktop (a sidebar some abaixo de md) e fora de editores de texto rico.
      if ((e.ctrlKey || e.metaKey) && e.key === 'b' && innerWidth >= 768) {
        if ((e.target as HTMLElement).isContentEditable) return;
        e.preventDefault();
        toggle();
      }
    };
    addEventListener('keydown', onKey);
    addEventListener(SIDEBAR_EVENT, toggle);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener(SIDEBAR_EVENT, toggle);
    };
  }, []);

  // Tooltip: aria-label do item ou o rótulo visível; os itens já têm nome acessível.
  const show = (target: EventTarget) => {
    const el = collapsed && (target as Element).closest?.<HTMLElement>('.side a, .side button');
    if (!el) return setTip(undefined);
    const r = el.getBoundingClientRect();
    setTip({
      text: el.getAttribute('aria-label') ?? el.querySelector('span')?.textContent ?? '',
      top: r.top + r.height / 2,
      left: r.right + 12,
    });
  };

  return (
    <Collapse.Provider value={[collapsed, toggle]}>
      <div
        className="shell flex min-h-dvh"
        data-side={collapsed ? 'collapsed' : tablet == null ? 'expanded' : 'open'}
        onMouseOver={(e) => show(e.target)}
        onMouseLeave={() => setTip(undefined)}
        onFocus={(e) => show(e.target)}
        onClick={(e) => {
          setTip(undefined);
          if ((e.target as Element).closest('nav a')) setAberta(false);
        }}
      >
        {children}
        {tip && (
          <div aria-hidden="true" className="side-tip" style={{ top: tip.top, left: tip.left }}>
            {tip.text}
          </div>
        )}
      </div>
    </Collapse.Provider>
  );
}

/** Botão de recolher/expandir (ícone "sidebar" do macOS). */
export function SidebarToggle() {
  const [collapsed, toggle] = useContext(Collapse);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-controls="app-sidebar"
      aria-keyshortcuts="Control+B Meta+B"
      aria-label={`${collapsed ? 'Expandir' : 'Recolher'} barra lateral`}
      className="side-toggle"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
        <path d="M9.5 4.5v15M5.6 8.5h1.8M5.6 11h1.8M5.6 13.5h1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
