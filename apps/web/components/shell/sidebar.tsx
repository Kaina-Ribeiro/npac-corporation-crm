import { ADMIN_ITEM } from './nav-items';
import { navItems } from './nav-menu';
import { CountBadge, NavLink } from './nav-link';
import { NavGroup, NavSection } from './nav-group';
import { ChatBadge, InboxLink } from '../inbox';
import { Fragment, Suspense } from 'react';
import { SearchButton } from './command-palette';
import { SavedViewsNav } from './saved-views-nav';
import { SidebarToggle } from './sidebar-shell';

const LINK =
  'flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink2 transition-colors hover:bg-black/5 hover:text-ink [&_svg]:h-4 [&_svg]:w-4 [&_svg]:flex-none';
const ACTIVE = 'bg-[var(--on)] !text-ink shadow-[inset_0_1px_0_#fff,0_2px_10px_rgba(0,0,0,.08)]';

/**
 * Desktop: navegação + bloco da pessoa logada no rodapé, sempre visível (a sidebar é fixa).
 * Recolhe para um trilho só de ícones (`.side`, `data-side` em `SidebarShell`; CSS em globals.css).
 */
export function Sidebar({
  head = false,
  mentoria = false,
  commercial = true,
  adminBadge = 0,
  footer,
}: {
  head?: boolean;
  /** Mostra a entrada do Acompanhamento (Diretoria e equipe de acompanhamento). */
  mentoria?: boolean;
  /** Falso para o cargo Acompanhamento: sem Avisos, telas comerciais e filtros salvos. */
  commercial?: boolean;
  /** Pedidos de acesso esperando a liderança. */
  adminBadge?: number;
  footer?: React.ReactNode;
}) {
  return (
    <aside
      id="app-sidebar"
      className="side glass sticky top-2.5 z-30 m-2.5 mr-0 hidden h-[calc(100dvh-20px)] flex-none flex-col gap-4 overflow-hidden rounded-3xl px-2.5 py-3 md:flex"
    >
      <div className="side-head flex items-center gap-2 pt-1 pr-1 pl-2">
        <span className="mark h-8 w-8 flex-none rounded-[9px] text-[17px]">N</span>
        <b className="side-label text-[15px] font-semibold">NPAC Corporation</b>
        <SidebarToggle />
      </div>
      {/* Mesmo preenchimento dos campos (.field): claro sobre o vidro, não um contorno cinza. */}
      <SearchButton className="side-search flex h-[34px] flex-none items-center gap-2.5 rounded-lg bg-white/60 px-2.5 text-sm font-medium text-ink2 shadow-[inset_0_0_0_0.5px_rgba(60,60,67,0.2),inset_0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-white/85 hover:text-ink dark:bg-white/[0.06] dark:shadow-[inset_0_0_0_0.5px_rgba(235,235,245,0.14)] dark:hover:bg-white/10 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:flex-none" />
      <nav aria-label="Navegação lateral" className="side-nav flex flex-col gap-px">
        {commercial && <InboxLink />}
        {navItems({ head, mentoria, commercial }).map((item, i, all) =>
          item.children ? (
            <NavGroup key={item.href} item={item} linkClass={LINK} activeClass={ACTIVE} />
          ) : (
            <Fragment key={item.href}>
              {item.section && item.section !== all[i - 1]?.section && (
                <NavSection title={item.section} />
              )}
              <NavLink item={item} className={LINK} activeClassName={ACTIVE}>
                {item.icon}
                <span className="side-label">{item.label}</span>
                {item.href === '/chat' && <ChatBadge />}
                {item.href === ADMIN_ITEM.href && adminBadge > 0 && (
                  <CountBadge n={adminBadge} label={`${adminBadge} pedidos de acesso`} />
                )}
                {!item.ready && (
                  <span className="side-label ml-auto text-[11px] font-medium text-ink3">
                    Em breve
                  </span>
                )}
              </NavLink>
            </Fragment>
          ),
        )}
      </nav>
      {commercial && (
        <div className="side-hide flex min-h-0 flex-col">
          <Suspense>
            <SavedViewsNav />
          </Suspense>
        </div>
      )}
      {footer && <div className="side-foot mt-auto border-t border-line px-1 pt-3">{footer}</div>}
    </aside>
  );
}
