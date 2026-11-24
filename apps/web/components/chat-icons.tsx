// Ícones do Chat (redesign A1), traço como os do protótipo. Sem 'use client': só SVG.
const props = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export const icVoltar = (
  <svg {...props} strokeWidth={2.3}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const icSeta = (
  <svg {...props} strokeWidth={2.6}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const icHash = (
  <svg {...props} strokeWidth={2.1}>
    <path d="M5 9h15M4 15h15M10 3.5 8 20.5M16 3.5 14 20.5" />
  </svg>
);
export const icSubir = (
  <svg {...props} strokeWidth={2.6}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const icEscrever = (
  <svg {...props} strokeWidth={1.9}>
    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    <path d="M17.6 3.6a2 2 0 0 1 2.8 2.8L12 14.8 8.5 15.5l.7-3.5Z" />
  </svg>
);
export const icX = (
  <svg {...props} strokeWidth={2.4}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const icBusca = (
  <svg {...props} strokeWidth={2.2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const icCadeado = (
  <svg {...props} strokeWidth={2}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const icRelogio = (
  <svg {...props} strokeWidth={2}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
