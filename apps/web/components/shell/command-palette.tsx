'use client';
import { useEffect, useState } from 'react';
import type { NovidadesDados } from './novidades-janela';
import type { PaletteItem } from './nav-menu';

// O conteúdo da paleta (lista, busca, comandos) fica fora da primeira carga: só o atalho e o
// botão "Buscar" vão no JS de toda tela. O painel baixa no primeiro uso e fica em cache. O mesmo
// pacote traz a janela "O que mudou no CRM" (NPAC-77): um carregamento a mais na casca não cabe
// no teto de JS do /leads.
type Pacote = typeof import('./command-palette-panel');
let panel: Promise<Pacote> | undefined;
const loadPanel = () =>
  (panel ??= import('./command-palette-panel').catch((e: unknown) => {
    panel = undefined; // falha de rede: a próxima tentativa baixa de novo
    throw e;
  }));

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

/**
 * Ctrl/⌘+K (ou "/") abre a busca rápida; o painel é baixado na primeira vez. Também abre "O que
 * mudou no CRM": sozinha ao carregar com novidade não vista (`novo`; a casca fica entre as telas,
 * então uma vez por carga) e no modo histórico pelo "O que mudou" do rodapé e do Mais
 * (`[data-novidades]`).
 */
export function CommandPalette({
  nav,
  commercial = true,
  novo,
  novidades,
}: {
  /** Destinos "Ir para", já filtrados pelo servidor (`paletteItems`): o mapa não vai no JS. */
  nav: PaletteItem[];
  commercial?: boolean;
  novo: boolean;
  novidades: NovidadesDados;
}) {
  const [open, setOpen] = useState(false);
  const [nov, setNov] = useState<'novas' | 'todas'>();
  const [pacote, setPacote] = useState<Pacote>();

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
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('[data-novidades]')) setNov('todas');
    };
    if (novo) setNov('novas');
    window.addEventListener('keydown', onKey);
    window.addEventListener('crm:command', onOpen);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('crm:command', onOpen);
      window.removeEventListener('click', onClick);
    };
  }, []);

  useEffect(() => {
    if ((open || nov) && !pacote)
      loadPanel().then(setPacote, () => {
        // sem rede: fecha, e o próximo clique tenta de novo
        setOpen(false);
        setNov(undefined);
      });
  }, [open, nov, pacote]);

  if (!pacote) return null;
  const { CommandPalettePanel: Panel, NovidadesJanela: Janela } = pacote;
  return (
    <>
      <Panel nav={nav} commercial={commercial} open={open} onClose={() => setOpen(false)} />
      {nov && <Janela modo={nov} dados={novidades} onClose={() => setNov(undefined)} />}
    </>
  );
}
