import { NavLink } from './nav-link';
import type { NavItem } from './nav-items';

// Server component de propósito: nada aqui vai para o JS do cliente (/leads tem teto de 150 KB
// gzip). Quem decide "aberto" é o NavLink do pai (aria-current) + CSS (`.side-sub` em globals.css).

const titulo = 'px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-ink3 uppercase';

/** Título de grupo da sidebar ("Acompanhamento", "Dados"); some com altura animada no trilho. */
export function NavSection({ title }: { title: string }) {
  return (
    <div className="side-fold">
      <h2 className={`${titulo} pt-3`}>{title}</h2>
    </div>
  );
}

/**
 * Item com sub-itens (o módulo do Acompanhamento para a Diretoria). Os filhos abrem só dentro de
 * `item.match`: o pai fica com `aria-current="true"` e o bloco seguinte abre com altura animada
 * (grid 0fr → 1fr). Fechado, `visibility: hidden` tira os filhos do Tab e do leitor de tela.
 * No trilho, só o ícone do pai aparece.
 */
export function NavGroup({
  item,
  linkClass,
  activeClass,
  rotulo,
}: {
  item: NavItem;
  linkClass: string;
  activeClass: string;
  /** Texto de cada sub-item; a sidebar dá uma 2ª linha ao "Ficha do mentorado". */
  rotulo: (n: NavItem) => React.ReactNode;
}) {
  return (
    <>
      <NavLink
        item={{ ...item, children: undefined }}
        className={`${linkClass} side-parent`}
        activeClassName={activeClass}
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
      </NavLink>
      <div className="side-sub">
        <div>
          {item.children?.map((c, i, all) => (
            <div key={c.href} className="contents">
              {/* O pai já dá nome ao primeiro grupo; os seguintes ganham título. */}
              {i > 0 && c.section && c.section !== all[i - 1]!.section && (
                <h2 className={`side-label ${titulo} pt-2`}>{c.section}</h2>
              )}
              <NavLink item={c} className={linkClass} activeClassName={activeClass}>
                {c.icon}
                {rotulo(c)}
              </NavLink>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
