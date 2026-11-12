'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** Só aparece se a navegação demorar mais que isto: troca rápida não pisca a barra. */
const SHOW_AFTER = 150;

/** Marca no `<html>` que troca a tela pelo esqueleto (`.nav-skeleton` em `globals.css`). */
const PENDING = 'navPending';

/**
 * Barrinha fina no topo enquanto uma página carrega. Começa no clique de um link interno e termina
 * quando a URL muda; avança devagar até 85% e completa. Link para outra tela mostra na hora o
 * esqueleto (`PageSkeleton`, já na casca) no lugar da página; mudar só a consulta (abas, filtros)
 * mantém a página.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const started = useRef(false);
  const fallback = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element).closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      // Arquivo da API (CSV) não troca de tela: nada de esqueleto.
      if (url.pathname !== location.pathname && !url.pathname.startsWith('/api/')) {
        document.documentElement.dataset[PENDING] = '';
        clearTimeout(fallback.current);
        // Se a navegação não acontecer (cancelada no caminho), a página volta.
        fallback.current = setTimeout(
          () => delete document.documentElement.dataset[PENDING],
          15_000,
        );
      }
      started.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => started.current && setState('loading'), SHOW_AFTER);
    }
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      // Saiu da casca (ex.: Trocar senha, em outro layout): a marca não pode ficar no <html>.
      delete document.documentElement.dataset[PENDING];
      clearTimeout(fallback.current);
    };
  }, []);

  useEffect(() => {
    delete document.documentElement.dataset[PENDING];
    clearTimeout(fallback.current);
    if (!started.current) return;
    started.current = false;
    clearTimeout(timer.current);
    setState((s) => (s === 'loading' ? 'done' : 'idle'));
  }, [pathname, search]);

  useEffect(() => {
    if (state !== 'done') return;
    const t = setTimeout(() => setState('idle'), 450);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div
      aria-hidden="true"
      data-state={state}
      className="nav-progress pointer-events-none fixed top-0 left-0 z-[60] h-[2.5px]"
    />
  );
}
