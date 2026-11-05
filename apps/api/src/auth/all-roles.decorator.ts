import { SetMetadata } from '@nestjs/common';

export const ALL_ROLES = 'auth:all-roles';
/**
 * Rota aberta também a quem não usa o comercial (cargo Acompanhamento). Sem este decorator, o
 * `PermissionsGuard` responde 404 para esse cargo: o comercial não se revela.
 */
export const AllRoles = () => SetMetadata(ALL_ROLES, true);
