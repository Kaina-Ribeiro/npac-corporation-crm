export type NavItem = {
  href: string;
  label: string;
  ready: boolean;
  icon: React.ReactNode;
  /** Prefixo que deixa o item ativo, quando difere do href (ex.: todas as telas do módulo). */
  match?: string;
  /** Título de grupo mostrado na sidebar antes do primeiro item da seção. */
  section?: 'Em breve' | 'Admin';
  /** Sub-itens (módulo do Acompanhamento para a Diretoria): abrem dentro de `match`. */
  children?: NavItem[];
  /**
   * Sem pré-carga (`prefetch={false}`): destino decidido a cada clique (redirect do servidor, ex.:
   * "Ficha do mentorado" → última ficha; pré-carregado, o Next guardaria o destino velho) ou tela
   * quase nunca aberta (itens "Em breve" do módulo).
   */
  semPrefetch?: boolean;
};

export const svg = (d: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

const ICONS = {
  dashboard: svg(<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />),
  hoje: svg(
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>,
  ),
  pipeline: svg(<path d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z" />),
  leads: svg(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.5c1.6.8 2.6 2.6 3 5.5" />
    </>,
  ),
  relatorios: svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  chat: svg(<path d="M4 5h16v11H9l-5 4z" />),
  equipe: svg(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>,
  ),
  playbook: svg(<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" />),
  admin: svg(
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
  acompanhamento: svg(
    <path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z" />,
  ),
  mais: svg(
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>,
  ),
};

/** Desktop: sidebar completa. */
export const SIDEBAR_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', ready: true, icon: ICONS.dashboard },
  { href: '/hoje', label: 'Hoje', ready: true, icon: ICONS.hoje },
  { href: '/pipeline', label: 'Pipeline', ready: true, icon: ICONS.pipeline },
  { href: '/leads', label: 'Leads', ready: true, icon: ICONS.leads },
  { href: '/relatorios', label: 'Relatórios', ready: true, icon: ICONS.relatorios },
  { href: '/chat', label: 'Chat', ready: true, icon: ICONS.chat },
  { href: '/equipe', label: 'Equipe', ready: true, icon: ICONS.equipe },
  { href: '/playbook', label: 'Playbook', ready: true, icon: ICONS.playbook },
];

/** Só HEAD: usuários, catálogo, etapas, auditoria e LGPD. */
export const ADMIN_ITEM: NavItem = {
  href: '/admin',
  label: 'Admin',
  ready: true,
  icon: ICONS.admin,
};

/** Módulo de mentorados: só para quem tem `modules.mentoria` (Diretoria e Acompanhamento). */
export const ACOMPANHAMENTO_ITEM: NavItem = {
  href: '/acompanhamento',
  match: '/acompanhamento',
  label: 'Acompanhamento',
  ready: true,
  icon: ICONS.acompanhamento,
};

/** Mobile: os quatro primeiros da sidebar, na mesma ordem, + Mais (Dashboard sempre primeiro). */
export const BOTTOM_ITEMS: NavItem[] = [
  ...SIDEBAR_ITEMS.slice(0, 4),
  { href: '/mais', label: 'Mais', ready: true, icon: ICONS.mais },
];

/** O restante da sidebar, na mesma ordem, listado na tela Mais. */
export const MORE_ITEMS: NavItem[] = SIDEBAR_ITEMS.slice(4);
