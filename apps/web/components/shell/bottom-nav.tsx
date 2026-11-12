import { InboxDot } from '../inbox';
import { BOTTOM_ITEMS } from './nav-items';
import { ForaDoModulo, NavLink } from './nav-link';

/**
 * Barra inferior do celular. Componente de servidor: os itens e ícones vão no HTML, não no JS de
 * toda página (o de /leads tem teto de 150 KB); só o link ativo e o "fora do módulo" são cliente.
 */
export function BottomNav() {
  return (
    // No Acompanhamento, o rodapé é o das abas do módulo (abas-mobile).
    <ForaDoModulo>
      <nav
        aria-label="Navegação inferior"
        className="glass fixed right-3.5 bottom-[max(16px,env(safe-area-inset-bottom))] left-3.5 z-20 grid h-[68px] grid-cols-5 rounded-[34px] p-1.5 md:hidden"
      >
        {BOTTOM_ITEMS.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            item={{ href }}
            className="relative flex flex-col items-center justify-center gap-0.5 rounded-[28px] text-[10px] font-medium text-ink2 transition-all [&_svg]:h-[22px] [&_svg]:w-[22px]"
            activeClassName="bg-[var(--on)] font-semibold !text-ink shadow-[inset_0_1px_0_#fff,0_2px_10px_rgba(0,0,0,.08)]"
          >
            {icon}
            {label}
            {href === '/mais' && <InboxDot />}
          </NavLink>
        ))}
      </nav>
    </ForaDoModulo>
  );
}
