/**
 * Tela de login para quem sai ou está sem sessão (NPAC-52): no módulo, a do Acompanhamento; no
 * resto, a do CRM. Arquivo à parte e mínimo: entra no JS de todas as telas (botão Sair).
 */
export const loginPath = (pathname: string) =>
  pathname === '/acompanhamento' || pathname.startsWith('/acompanhamento/')
    ? '/login/acompanhamento'
    : '/login';
