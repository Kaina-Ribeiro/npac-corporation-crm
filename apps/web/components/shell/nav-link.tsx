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
  const active = path === item.href || path.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      prefetch={item.ready}
      aria-current={active ? 'page' : undefined}
      className={`${className} ${active ? activeClassName : ''}`}
    >
      {children}
    </Link>
  );
}
