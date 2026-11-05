import { ACOMPANHAMENTO_ITEM, ADMIN_ITEM, SIDEBAR_ITEMS, svg, type NavItem } from './nav-items';

// Só o servidor importa este arquivo (sidebar e layout, que entrega o Ctrl+K pronto). Fica fora
// de nav-items.tsx, que a barra inferior leva para o cliente: o JS de /leads tem teto de 150 KB.

/**
 * Ícones das telas do Acompanhamento: mesmos desenhos das abas do rodapé no celular (abas-mobile).
 */
const AC_ICONS = {
  dashboard: svg(<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />),
  linha: svg(<path d="M4 6h16M4 12h10M4 18h7M18 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />),
  rdv: svg(<path d="M4 19h16M6 15l4-5 3 3 5-7" />),
  backup: svg(<path d="M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />),
};

/** Telas do módulo de mentorados, com os mesmos nomes e a mesma ordem das antigas abas do topo. */
export const ACOMPANHAMENTO_SUBITEMS: NavItem[] = [
  {
    href: '/acompanhamento/dashboard',
    label: 'Dashboard',
    ready: true,
    icon: AC_ICONS.dashboard,
    section: 'Acompanhamento',
  },
  {
    href: '/acompanhamento/linha-do-tempo',
    label: 'Linha do tempo',
    ready: true,
    icon: AC_ICONS.linha,
    section: 'Acompanhamento',
  },
  {
    href: '/acompanhamento/rdv',
    label: 'Linha do tempo RDV',
    ready: true,
    icon: AC_ICONS.rdv,
    section: 'Acompanhamento',
  },
  {
    href: '/acompanhamento/backup',
    label: 'Importação e backup',
    ready: true,
    icon: AC_ICONS.backup,
    section: 'Dados',
  },
];

/**
 * Itens da sidebar para a pessoa. Quem não usa o comercial (cargo Acompanhamento) vê só as telas
 * do módulo, soltas (Gabriel, 05/11/2026; substitui o "mesmo menu para todos" da D23). Para a
 * Diretoria, o item do módulo leva as telas como sub-itens.
 */
export function navItems(opts: {
  head: boolean;
  mentoria: boolean;
  commercial?: boolean;
}): NavItem[] {
  if (opts.commercial === false) return opts.mentoria ? ACOMPANHAMENTO_SUBITEMS : [];
  return [
    ...SIDEBAR_ITEMS,
    ...(opts.mentoria ? [{ ...ACOMPANHAMENTO_ITEM, children: ACOMPANHAMENTO_SUBITEMS }] : []),
    ...(opts.head ? [ADMIN_ITEM] : []),
  ];
}

export type PaletteItem = { href: string; label: string; icon: React.ReactNode };

/**
 * Destinos do Ctrl+K: a navegação achatada. As telas do módulo aparecem como
 * "Acompanhamento · <tela>" (o pai some: abre a mesma tela que o Dashboard do módulo).
 */
export function paletteItems(opts: {
  head: boolean;
  mentoria: boolean;
  commercial?: boolean;
}): PaletteItem[] {
  const modulo = (n: NavItem) => ({
    href: n.href,
    label: `${ACOMPANHAMENTO_ITEM.label} · ${n.label}`,
    icon: n.icon,
  });
  return navItems(opts).flatMap((n) =>
    n.children
      ? n.children.map(modulo)
      : n.href.startsWith(ACOMPANHAMENTO_ITEM.match!)
        ? [modulo(n)]
        : [{ href: n.href, label: n.label, icon: n.icon }],
  );
}
