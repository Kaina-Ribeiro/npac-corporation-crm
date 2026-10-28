import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:public';
/** Rota sem sessão (ex.: health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_INCOMPLETE = 'auth:allow-incomplete';
/** Rota liberada mesmo com MFA pendente (HEAD) ou troca de senha obrigatória (ex.: /me). */
export const AllowIncomplete = () => SetMetadata(ALLOW_INCOMPLETE, true);
