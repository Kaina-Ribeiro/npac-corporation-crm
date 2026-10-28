import { ADMIN_ITEM, SIDEBAR_ITEMS } from './nav-items';
import { NavLink } from './nav-link';
import { InboxLink } from '../inbox';
import { Suspense } from 'react';
import { SearchButton } from './command-trigger';
import { SavedViewsNav } from './saved-views-nav';

/** Desktop: navegação + bloco da pessoa logada no rodapé, sempre visível (a sidebar é fixa). */
export function Sidebar({ head = false, footer }: { head?: boolean; footer?: React.ReactNode }) {
  return (
    <aside className="glass sticky top-2.5 m-2.5 mr-0 hidden h-[calc(100dvh-20px)] w-[236px] flex-none flex-col gap-4 rounded-3xl px-2.5 py-3 md:flex">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <span className="mark h-8 w-8 rounded-[9px] text-[17px]">N</span>
        <b className="text-[15px] font-semibold">NPAC Corporation</b>
      </div>
      <SearchButton className="flex h-[34px] items-center gap-2.5 rounded-lg border border-line px-2.5 text-sm font-medium text-ink2 transition-colors hover:bg-black/5 hover:text-ink [&_svg]:h-4 [&_svg]:w-4" />
      <nav aria-label="Navegação lateral" className="flex flex-col gap-px">
        <InboxLink />
        {(head ? [...SIDEBAR_ITEMS, ADMIN_ITEM] : SIDEBAR_ITEMS).map((item) => (
          <NavLink
            key={item.href}
            item={item}
            className="flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink2 transition-colors hover:bg-black/5 hover:text-ink [&_svg]:h-4 [&_svg]:w-4 [&_svg]:flex-none"
            activeClassName="bg-[var(--on)] !text-ink shadow-[inset_0_1px_0_#fff,0_2px_10px_rgba(0,0,0,.08)]"
          >
            {item.icon}
            {item.label}
            {!item.ready && (
              <span className="ml-auto text-[11px] font-medium text-ink3">Em breve</span>
            )}
          </NavLink>
        ))}
      </nav>
      <Suspense>
        <SavedViewsNav />
      </Suspense>
      {footer && <div className="mt-auto border-t border-line px-1 pt-3">{footer}</div>}
    </aside>
  );
}
