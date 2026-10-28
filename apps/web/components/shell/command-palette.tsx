'use client';
import type { LeadCatalog, LeadDTO, Page } from '@npac/shared';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { clientApi } from '@/lib/client-api';
import { ADMIN_ITEM, SIDEBAR_ITEMS } from './nav-items';
import { useSavedViews } from './saved-views-nav';

type Item = {
  id: string;
  label: string;
  /** Seção da lista (como no Spotlight): Leads, Ações, Ir para… */
  group: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
};

const glyph = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ICON = {
  lead: glyph('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0'),
  plus: glyph('M12 5v14M5 12h14'),
  filter: glyph('M4 6h16M7 12h10M10 18h4'),
  theme: glyph('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z'),
  search: glyph('m20 20-4.2-4.2M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z'),
};

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

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

/**
 * Ctrl/⌘+K (ou "/"): busca leads do escopo e leva a qualquer tela ou ação, só com teclado.
 * A busca vai por POST, como a lista de leads, para o termo não ficar em URL ou histórico.
 */
export function CommandPalette({ head }: { head: boolean }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<LeadDTO[]>([]);
  const [stages, setStages] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

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
    if (!open) return;
    setQuery('');
    setLeads([]);
    setActive(0);
    input.current?.focus();
  }, [open]);

  const needStages = open && !Object.keys(stages).length;
  useEffect(() => {
    if (!needStages) return;
    void clientApi<LeadCatalog>('/api/leads/catalog')
      .then((c) => setStages(Object.fromEntries(c.stages.map((s) => [s.key, s.label]))))
      .catch(() => {});
  }, [needStages]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setLeads([]);
      return;
    }
    let stale = false;
    const t = setTimeout(() => {
      void clientApi<Page<LeadDTO>>('/api/leads/search', 'POST', { search: term, pageSize: 6 })
        .then((r) => !stale && setLeads(r.items))
        .catch(() => {});
    }, 150);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query]);

  const views = useSavedViews();
  const go = (href: string) => () => {
    setOpen(false);
    router.push(href);
  };
  const commands: Item[] = [
    { id: 'new', label: 'Novo lead', group: 'Ações', icon: ICON.plus, run: go('/leads/new') },
    ...(head ? [...SIDEBAR_ITEMS, ADMIN_ITEM] : SIDEBAR_ITEMS).map((n) => ({
      id: n.href,
      label: n.label,
      group: 'Ir para',
      icon: n.icon,
      run: go(n.href),
    })),
    ...views.map((v) => ({
      id: `view-${v.id}`,
      label: v.name,
      group: 'Filtros salvos',
      icon: ICON.filter,
      run: go(`/leads?view=${v.id}`),
    })),
    {
      id: 'theme',
      label: resolvedTheme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro',
      group: 'Ações',
      icon: ICON.theme,
      run: () => {
        setOpen(false);
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
      },
    },
  ];
  const f = fold(query.trim());
  const items: Item[] = [
    ...leads.map((l) => ({
      id: l.id,
      label: l.name,
      group: 'Leads',
      icon: ICON.lead,
      hint: [l.tier, stages[l.stageKey], l.sdr.name].filter(Boolean).join(' · '),
      run: go(`/leads/${l.id}`),
    })),
    ...commands.filter((c) => !f || fold(c.label).includes(f)),
  ];
  const current = Math.min(active, Math.max(0, items.length - 1));

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/15 px-4 pt-[14vh] dark:bg-black/35"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        className="w-full max-w-[640px] overflow-hidden rounded-[22px] bg-[rgba(246,246,248,.94)] shadow-[0_0_0_.5px_rgba(0,0,0,.12),0_30px_80px_-24px_rgba(0,0,0,.4)] backdrop-blur-2xl backdrop-saturate-150 dark:bg-[rgba(30,30,34,.94)] dark:shadow-[0_0_0_.5px_rgba(255,255,255,.12),0_30px_80px_-24px_rgba(0,0,0,.7)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 [&_svg]:size-[22px] [&_svg]:flex-none [&_svg]:text-ink3">
          {ICON.search}
          <input
            ref={input}
            role="combobox"
            aria-label="Buscar leads ou ir para…"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[current] ? `${listId}-${current}` : undefined}
            autoComplete="off"
            placeholder="Buscar leads ou ir para…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const d = e.key === 'ArrowDown' ? 1 : -1;
                setActive((current + d + items.length) % Math.max(1, items.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                items[current]?.run();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
              }
            }}
            className="h-16 min-w-0 flex-1 bg-transparent text-[20px] tracking-[-0.01em] outline-none placeholder:text-ink3 focus-visible:outline-none!"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="max-h-[52vh] overflow-y-auto px-2 pb-2"
        >
          {items.map((it, i) => (
            <Fragment key={it.id}>
              {it.group !== items[i - 1]?.group && (
                <li
                  role="presentation"
                  className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-ink3 uppercase"
                >
                  {it.group}
                </li>
              )}
              <li
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                onMouseMove={() => setActive(i)}
                onClick={it.run}
                className={`flex h-10 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[14px] [&_svg]:size-[18px] [&_svg]:flex-none ${
                  i === current
                    ? 'bg-[#0a7af0] text-white [&_svg]:text-white'
                    : 'text-ink [&_svg]:text-ink2'
                }`}
              >
                {it.icon}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && (
                  <span
                    className={`truncate text-xs ${i === current ? 'text-white/80' : 'text-ink2'}`}
                  >
                    {it.hint}
                  </span>
                )}
              </li>
            </Fragment>
          ))}
          {!items.length && (
            <li className="px-3 py-6 text-center text-sm text-ink2">Nada encontrado.</li>
          )}
        </ul>
        <p className="flex gap-4 border-t border-line px-5 py-2 text-[11px] text-ink3">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc fechar</span>
        </p>
      </div>
    </div>
  );
}
