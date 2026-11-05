'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from './nav-items';

/** Link de navegação que marca a seção atual (aria-current). */
export function NavLink({
  item,
  className,
  activeClassName,
  children,
}: {
  item: NavItem;
  className: string;
  activeClassName: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const base = item.match ?? item.href;
  const active = path === base || path.startsWith(`${base}/`);
  // Item que cobre várias telas (`match`, o pai do grupo): quem marca a página é o filho ativo.
  return (
    <Link
      href={item.href}
      prefetch={item.ready}
      aria-current={active ? (item.match ? 'true' : 'page') : undefined}
      className={`${className} ${active ? activeClassName : ''}`}
    >
      {children}
    </Link>
  );
}

/** Contador ao lado de um item de navegação (ex.: pedidos de acesso no Admin). */
export function CountBadge({ n, label }: { n: number; label: string }) {
  return (
    <span
      aria-label={label}
      className="nav-badge badge-pop ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums"
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}
