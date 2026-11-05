'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavLink } from './nav-link';
import type { NavItem } from './nav-items';

/** Título de grupo da sidebar ("Acompanhamento", "Dados"); some com altura animada no trilho. */
export function NavSection({ title }: { title: string }) {
  return (
    <div className="side-fold">
      <h2 className="px-2.5 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-ink3 uppercase">
        {title}
      </h2>
    </div>
  );
}

/**
 * Item com sub-itens (o módulo do Acompanhamento para a Diretoria). Os filhos abrem só dentro de
 * `item.match`: altura animada por `grid-template-rows` (`.side-sub` em globals.css). Fechado,
 * o bloco fica `inert` e sai do Tab. No trilho, só o ícone do pai aparece.
 */
export function NavGroup({
  item,
  linkClass,
  activeClass,
}: {
  item: NavItem;
  linkClass: string;
  activeClass: string;
}) {
  const path = usePathname();
  const base = item.match ?? item.href;
  const open = path === base || path.startsWith(`${base}/`);
  return (
    <>
      <Link
        href={item.href}
        prefetch={item.ready}
        aria-current={open ? 'true' : undefined}
        data-open={open ? '' : undefined}
        className={`${linkClass} side-parent ${open ? activeClass : ''}`}
      >
        {item.icon}
        <span className="side-label">{item.label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="side-chevron side-label ml-auto !h-3.5 !w-3.5 text-ink3"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Link>
      <div className="side-sub" data-open={open ? '' : undefined} inert={!open}>
        <div>
          {item.children?.map((c, i, all) => (
            <div key={c.href} className="contents">
              {/* O pai já dá nome ao primeiro grupo; os seguintes ganham título. */}
              {i > 0 && c.section !== all[i - 1]!.section && c.section && (
                <h2 className="side-label px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink3 uppercase">
                  {c.section}
                </h2>
              )}
              <NavLink item={c} className={linkClass} activeClassName={activeClass}>
                {c.icon}
                <span className="side-label">{c.label}</span>
              </NavLink>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
