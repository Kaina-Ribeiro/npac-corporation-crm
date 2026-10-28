'use client';
import type { SavedViewDTO } from '@npac/shared';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clientApi } from '@/lib/client-api';

/** Lista os filtros salvos na sidebar (como as "views" do Linear); recarrega ao salvar/apagar. */
export function useSavedViews() {
  const [views, setViews] = useState<SavedViewDTO[]>([]);
  useEffect(() => {
    const load = () =>
      void clientApi<SavedViewDTO[]>('/api/views')
        .then(setViews)
        .catch(() => {});
    load();
    window.addEventListener('crm:views', load);
    return () => window.removeEventListener('crm:views', load);
  }, []);
  return views;
}

export function SavedViewsNav() {
  const views = useSavedViews();
  const path = usePathname();
  const current = useSearchParams().get('view');
  if (!views.length) return null;
  return (
    <nav aria-label="Filtros salvos" className="flex min-h-0 flex-col gap-px overflow-y-auto">
      <h2 className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-ink3 uppercase">
        Filtros salvos
      </h2>
      {views.map((v) => {
        const active = path === '/leads' && current === v.id;
        return (
          <Link
            key={v.id}
            href={`/leads?view=${v.id}`}
            aria-current={active ? 'page' : undefined}
            className={`flex h-[30px] items-center gap-2.5 truncate rounded-lg px-2.5 text-[13px] font-medium text-ink2 transition-colors hover:bg-black/5 hover:text-ink ${
              active ? 'bg-[var(--on)] !text-ink' : ''
            }`}
          >
            <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-ink3" />
            <span className="truncate">{v.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
