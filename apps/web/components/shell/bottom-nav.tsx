import { InboxDot } from '../inbox';
import { BOTTOM_ITEMS } from './nav-items';
import { NavLink } from './nav-link';

export function BottomNav() {
  return (
    <nav
      aria-label="Navegação inferior"
      className="glass fixed right-3.5 bottom-[max(16px,env(safe-area-inset-bottom))] left-3.5 z-20 grid h-[68px] grid-cols-5 rounded-[34px] p-1.5 md:hidden"
    >
      {BOTTOM_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          className="relative flex flex-col items-center justify-center gap-0.5 rounded-[28px] text-[10px] font-medium text-ink2 transition-all [&_svg]:h-[22px] [&_svg]:w-[22px]"
          activeClassName="glass-pill font-semibold !text-ink"
        >
          {item.icon}
          {item.label}
          {item.href === '/mais' && <InboxDot />}
        </NavLink>
      ))}
    </nav>
  );
}
