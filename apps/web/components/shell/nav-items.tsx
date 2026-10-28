export type NavItem = { href: string; label: string; ready: boolean; icon: React.ReactNode };

const svg = (d: React.ReactNode) => (
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
  { href: '/chat', label: 'Chat', ready: false, icon: ICONS.chat },
  { href: '/equipe', label: 'Equipe', ready: false, icon: ICONS.equipe },
  { href: '/playbook', label: 'Playbook', ready: false, icon: ICONS.playbook },
];

/** Mobile: barra inferior com cinco destinos. */
export const BOTTOM_ITEMS: NavItem[] = [
  { href: '/hoje', label: 'Hoje', ready: true, icon: ICONS.hoje },
  { href: '/pipeline', label: 'Pipeline', ready: true, icon: ICONS.pipeline },
  { href: '/leads', label: 'Leads', ready: true, icon: ICONS.leads },
  { href: '/chat', label: 'Chat', ready: false, icon: ICONS.chat },
  { href: '/mais', label: 'Mais', ready: true, icon: ICONS.mais },
];

/** Seções que existem na navegação mas ainda não foram construídas. */
export const SOON: Record<string, string> = {
  dashboard: 'Dashboard',
  pipeline: 'Pipeline',
  relatorios: 'Relatórios',
  chat: 'Chat',
  equipe: 'Equipe',
  playbook: 'Playbook',
  mais: 'Mais',
};
