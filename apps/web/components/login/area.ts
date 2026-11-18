import type { AccessArea } from '@npac/shared/enums';

/**
 * As duas telas de entrada (NPAC-51, protótipo "Login da equipe"): CRM (noite) e Acompanhamento
 * (ouro líquido de dia). Sem 'use client': o servidor e os formulários leem o mesmo mapa.
 */
export const LOGIN_AREA: Record<
  AccessArea,
  {
    /** Endereço da tela de login; `solicitar` e `esqueci` ficam embaixo dele. */
    base: string;
    /** Para onde vai depois de entrar: `/` escolhe pelo cargo; `?area=` pede o módulo. */
    destino: string;
    marca: string;
    frase: string;
    outra: { pergunta: string; acao: string; area: AccessArea };
  }
> = {
  COMERCIAL: {
    base: '/login',
    destino: '/',
    marca: 'Área comercial',
    frase: 'O pipeline, a agenda dos closers e cada venda do time em um só lugar.',
    outra: { pergunta: 'É do Acompanhamento?', acao: 'Entrar por aqui', area: 'ACOMPANHAMENTO' },
  },
  ACOMPANHAMENTO: {
    base: '/login/acompanhamento',
    destino: '/?area=acompanhamento',
    marca: 'Acompanhamento',
    frase: 'A jornada de cada mentorado, a Fila do dia e as reuniões em um só lugar.',
    outra: { pergunta: 'É do comercial?', acao: 'Entrar no CRM', area: 'COMERCIAL' },
  },
};

/** Usuário lembrado (cookie `npac_last_user`, `Path=/login`: vale nas duas telas). */
export const validLastUser = (v: string | undefined) =>
  v && /^[a-z0-9_.]{3,30}$/.test(v) ? v : undefined;
