import { SetMetadata } from '@nestjs/common';
import type { Action } from '@npac/shared';

export const CAN = 'auth:can';
/** Exige que o papel do usuário possa executar `action` (ver matriz em @npac/shared). */
export const Can = (action: Action) => SetMetadata(CAN, action);
