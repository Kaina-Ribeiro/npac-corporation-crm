'use client';
import { useEffect, useState, type ComponentType } from 'react';
import type { PanelProps } from './command-palette-panel';
import type { PaletteItem } from './nav-menu';

// O conteúdo da paleta (lista, busca, comandos) fica fora da primeira carga: só o atalho e o
// botão "Buscar" vão no JS de toda tela. O painel baixa no primeiro uso e fica em cache.
let panel: Promise<ComponentType<PanelProps>> | undefined;
const loadPanel = () =>
  (panel ??= import('./command-palette-panel').then(
    (m) => m.CommandPalettePanel,
    (e: unknown) => {
      panel = undefined; // falha de rede: a próxima tentativa baixa de novo
      throw e;
    },
  ));

/** Adianta o download quando a pessoa aponta ou foca o "Buscar". */
const preload = () => void loadPanel().catch(() => {});

/** Abre a paleta de qualquer lugar (botão da sidebar, tela Mais). */
export const openCommandPalette = () => window.dispatchEvent(new Event('crm:command'));

/** Botão "Buscar  Ctrl K" da sidebar e da tela Mais. */
export function SearchButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      onPointerEnter={preload}
      onFocus={preload}
      className={className}
    >
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

/** Ctrl/⌘+K (ou "/") abre a busca rápida; o painel é baixado na primeira vez. */
export function CommandPalette({
  nav,
  commercial = true,
}: {
  /** Destinos "Ir para", já filtrados pelo servidor (`paletteItems`): o mapa não vai no JS. */
  nav: PaletteItem[];
  commercial?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<PanelProps> | null>(null);

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
    if (!open || Panel) return;
    loadPanel().then(
      (P) => setPanel(() => P),
      () => setOpen(false), // sem rede: fecha, e o próximo Ctrl+K tenta de novo
    );
  }, [open, Panel]);

  if (!Panel) return null;
  return <Panel nav={nav} commercial={commercial} open={open} onClose={() => setOpen(false)} />;
}
