'use client';
import type { LeadCatalog, LeadDTO, Page } from '@npac/shared';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { clientApi } from '@/lib/client-api';
import { ADMIN_ITEM, SIDEBAR_ITEMS } from './nav-items';
import { useSavedViews } from './saved-views-nav';

type Item = { id: string; label: string; hint?: string; icon?: ReactNode; run: () => void };

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
    { id: 'new', label: 'Novo lead', hint: 'Criar', run: go('/leads/new') },
    ...(head ? [...SIDEBAR_ITEMS, ADMIN_ITEM] : SIDEBAR_ITEMS).map((n) => ({
      id: n.href,
      label: n.label,
      hint: 'Ir para',
      icon: n.icon,
      run: go(n.href),
    })),
    ...views.map((v) => ({
      id: `view-${v.id}`,
      label: v.name,
      hint: 'Filtro salvo',
      run: go(`/leads?view=${v.id}`),
    })),
    {
      id: 'theme',
      label: resolvedTheme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro',
      hint: 'Aparência',
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
      hint: [l.tier, stages[l.stageKey], l.sdr.name].filter(Boolean).join(' · '),
      run: go(`/leads/${l.id}`),
    })),
    ...commands.filter((c) => !f || fold(c.label).includes(f)),
  ];
  const current = Math.min(active, Math.max(0, items.length - 1));

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        className="glass-card w-full max-w-xl overflow-hidden !rounded-2xl shadow-[0_24px_60px_-20px_rgba(0,0,0,.45)]"
      >
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
          className="h-14 w-full border-b border-line bg-transparent px-5 text-base outline-none placeholder:text-ink3"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="max-h-[50vh] overflow-y-auto p-2"
        >
          {items.map((it, i) => (
            <li
              key={it.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              onMouseMove={() => setActive(i)}
              onClick={it.run}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                i === current ? 'bg-black/5 dark:bg-white/10' : ''
              } [&_svg]:size-4 [&_svg]:flex-none [&_svg]:text-ink2`}
            >
              {it.icon}
              <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
              {it.hint && <span className="truncate text-xs text-ink2">{it.hint}</span>}
            </li>
          ))}
          {!items.length && (
            <li className="px-3 py-6 text-center text-sm text-ink2">Nada encontrado.</li>
          )}
        </ul>
        <p className="flex gap-4 border-t border-line px-5 py-2.5 text-xs text-ink3">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc fechar</span>
        </p>
      </div>
    </div>
  );
}
