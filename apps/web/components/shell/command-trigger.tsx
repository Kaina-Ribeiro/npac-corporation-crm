'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// O painel só é baixado na primeira vez que alguém abre o Ctrl+K: fora do JS inicial das páginas.
const PaletteDialog = dynamic(() => import('./command-palette'), { ssr: false });

/** Abre a paleta de qualquer lugar (botão da sidebar, tela Mais). */
export const openCommandPalette = () => window.dispatchEvent(new Event('crm:command'));

/** Botão "Buscar  Ctrl K" da sidebar e da tela Mais. */
export function SearchButton({ className = '' }: { className?: string }) {
  return (
    <button type="button" onClick={openCommandPalette} className={className}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="flex-1 text-left">Buscar</span>
      <kbd className="rounded-md border border-line px-1.5 font-sans text-[11px] text-ink3">
        Ctrl K
      </kbd>
    </button>
  );
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/** Atalhos Ctrl/⌘+K e "/" sempre ativos; o painel vem do servidor na primeira abertura. */
export function CommandPalette({ head }: { head: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !typing(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('crm:command', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('crm:command', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setLoaded(true);
  }, [open]);

  return loaded ? <PaletteDialog head={head} open={open} setOpen={setOpen} /> : null;
}
