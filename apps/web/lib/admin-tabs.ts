/** Abas do Admin (fora do componente 'use client': a página lê o cookie com elas). */
export const ADMIN_TABS = ['Usuários', 'Produtos', 'Etapas', 'Auditoria', 'LGPD'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];
