import { oneOf } from '@npac/shared/screen-prefs';

/** Abas do Admin (fora do componente 'use client': a página lê o cookie com elas). */
export const ADMIN_TABS = ['Usuários', 'Produtos', 'Etapas', 'Auditoria', 'LGPD'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

/** Filtro de área da Equipe (só a Diretoria; "Todas" = sem valor). */
export type FiltroArea = 'COMERCIAL' | 'ACOMPANHAMENTO' | undefined;

/** Aba (Usuários é a padrão e não é gravada) e filtro de área, lembrados no aparelho (NPAC-46). */
export const ADMIN_PREFS_RULE = {
  tab: oneOf(ADMIN_TABS.filter((t) => t !== 'Usuários')),
  area: oneOf(['COMERCIAL', 'ACOMPANHAMENTO']),
};

/** Cookie do quadro "Acessos": só o número da última linha vista (o "novo" é o que vem depois). */
export const ACESSOS_COOKIE = 'npac_acessos';
