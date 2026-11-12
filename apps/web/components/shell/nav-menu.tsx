import { ACOMPANHAMENTO_ITEM, ADMIN_ITEM, SIDEBAR_ITEMS, svg, type NavItem } from './nav-items';

// Só o servidor importa este arquivo (sidebar e layout, que entrega o Ctrl+K pronto). Fica fora
// de nav-items.tsx, que a barra inferior leva para o cliente: o JS de /leads tem teto de 150 KB.

const icone = (d: string) => svg(<path d={d} />);

const item = (href: string, label: string, d: string, section?: NavItem['section']): NavItem => ({
  href: `/acompanhamento/${href}`,
  label,
  ready: true,
  icon: icone(d),
  section,
  // "Em breve" é uma tela de aviso, quase nunca aberta: não vale duas requisições a cada página.
  ...(section === 'Em breve' ? { semPrefetch: true } : {}),
});

/** As 11 abas do módulo (D8). */
const ACOMPANHAMENTO_ABAS: NavItem[] = [
  item('fila', 'Fila do dia', 'M4 6h16M4 12h16M4 18h10'),
  item(
    'mentorados',
    'Mentorados',
    'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.8M16 3.2a3.5 3.5 0 0 1 0 6.6',
  ),
  { ...item('ficha', 'Ficha do mentorado', 'M6 3h9l4 4v14H6zM9 12h7M9 16h7'), semPrefetch: true },
  item('onboarding', 'Onboarding', 'M4 5h16l-6 7v6l-4 2v-8z'),
  item('plano', 'Plano dos 12 meses', 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4'),
  item('reunioes', 'Reuniões', 'M3 7h13v10H3zM16 11l5-3v8l-5-3'),
  item('em-breve/pmes', 'PMEs e ciclos', 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2', 'Em breve'),
  item(
    'em-breve/linha-do-tempo',
    'Linha do tempo e conquistas',
    'M4 6h16M4 12h10M4 18h7',
    'Em breve',
  ),
  item(
    'em-breve/envios',
    'Envios físicos',
    'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
    'Em breve',
  ),
  item('em-breve/eventos', 'Eventos e agenda', 'M5 4h14v17H5zM5 9h14', 'Em breve'),
  item(
    'em-breve/renovacoes',
    'Renovações e gestão',
    'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
    'Em breve',
  ),
];

const CONFIGURACOES = item(
  'configuracoes',
  'Configurações',
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 3v3M12 18v3M3 12h3M18 12h3',
  'Admin',
);

type Opcoes = {
  head: boolean;
  mentoria: boolean;
  commercial?: boolean;
  /** Selo de Admin no módulo: mostra Configurações. */
  mentoriaAdmin?: boolean;
};

/**
 * Itens da sidebar para a pessoa. Quem não usa o comercial (cargo Acompanhamento) vê só as telas
 * do módulo, soltas (Gabriel, 05/11/2026). Para a Diretoria, o item do módulo leva as telas como
 * sub-itens.
 */
export function navItems(opts: Opcoes): NavItem[] {
  const abas = [...ACOMPANHAMENTO_ABAS, ...(opts.mentoriaAdmin ? [CONFIGURACOES] : [])];
  if (opts.commercial === false) return opts.mentoria ? abas : [];
  return [
    ...SIDEBAR_ITEMS,
    ...(opts.mentoria ? [{ ...ACOMPANHAMENTO_ITEM, children: abas }] : []),
    ...(opts.head ? [ADMIN_ITEM] : []),
  ];
}

export type PaletteItem = { href: string; label: string; icon: React.ReactNode };

/**
 * Destinos do Ctrl+K: a navegação achatada. As telas do módulo aparecem como
 * "Acompanhamento · <tela>" (o pai some: abre a mesma tela que a primeira do módulo).
 */
export function paletteItems(opts: Opcoes): PaletteItem[] {
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
