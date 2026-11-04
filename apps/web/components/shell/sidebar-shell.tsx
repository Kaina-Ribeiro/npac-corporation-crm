'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SIDEBAR_COOKIE, SIDEBAR_EVENT } from '@/lib/sidebar';

const Collapse = createContext({ collapsed: false, toggle: () => {} });

const DESKTOP = '(min-width: 48rem)';

/** Texto do tooltip: `data-tip`, o aria-label ou o rótulo visível do item (+ atalho). */
function tipOf(el: HTMLElement) {
  const text =
    el.dataset.tip ??
    el.getAttribute('aria-label') ??
    el.querySelector('.side-label, span')?.textContent ??
    '';
  const mac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  return el.dataset.kbd ? `${text}  ${mac ? '⌘' : 'Ctrl '}${el.dataset.kbd}` : text;
}

/**
 * Casca do app: guarda se a sidebar está recolhida (cookie, para o servidor já renderizar
 * assim), atende Ctrl/⌘+B e mostra o nome dos itens num tooltip quando ela vira trilho.
 */
export function SidebarShell({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [tip, setTip] = useState<{ text: string; top: number; left: number; on: boolean }>();

  const toggle = useCallback(() => {
    setTip(undefined);
    setCollapsed((c) => !c);
  }, []);

  useEffect(() => {
    document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? 1 : 0}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b')
        return;
      if (!matchMedia(DESKTOP).matches) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(SIDEBAR_EVENT, toggle);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SIDEBAR_EVENT, toggle);
    };
  }, [toggle]);

  const show = (target: EventTarget) => {
    if (!collapsed || !(target instanceof Element)) return;
    const el = target.closest<HTMLElement>('.side a, .side button');
    if (!el) return setTip((t) => t && { ...t, on: false });
    const r = el.getBoundingClientRect();
    setTip({ text: tipOf(el), top: r.top + r.height / 2, left: r.right + 12, on: true });
  };
  const hide = () => setTip((t) => t && { ...t, on: false });

  return (
    <Collapse.Provider value={{ collapsed, toggle }}>
      <div
        className="shell flex min-h-dvh"
        data-side={collapsed ? 'collapsed' : 'expanded'}
        onMouseOver={(e) => show(e.target)}
        onMouseLeave={hide}
        onFocus={(e) => {
          if (e.target.matches(':focus-visible')) show(e.target);
        }}
        onBlur={hide}
        onClick={hide}
      >
        {children}
        {collapsed && tip && (
          <div
            aria-hidden="true"
            data-on={tip.on || undefined}
            className="side-tip"
            style={{ top: tip.top, left: tip.left }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </Collapse.Provider>
  );
}

/** Botão de recolher/expandir (ícone "sidebar" do macOS). */
export function SidebarToggle() {
  const { collapsed, toggle } = useContext(Collapse);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-controls="app-sidebar"
      aria-keyshortcuts="Control+B Meta+B"
      aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
      data-kbd="B"
      className="side-toggle"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
        <path d="M9.5 4.5v15" />
        <path className="side-toggle-fill" d="M5.6 8.5h1.8M5.6 11h1.8M5.6 13.5h1.8" />
      </svg>
    </button>
  );
}
