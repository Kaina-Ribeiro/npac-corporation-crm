import { SetMetadata } from '@nestjs/common';

export const REQUIRES_MFA = 'auth:requires-mfa';
/**
 * Rota que exige verificação em duas etapas ativa para DIRETOR e ACOMPANHAMENTO (D18): o
 * módulo Acompanhamento guarda saúde, fé e dinheiro de mentorados.
 */
export const RequiresMfa = () => SetMetadata(REQUIRES_MFA, true);
