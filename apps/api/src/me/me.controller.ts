import { Controller, Get, Inject } from '@nestjs/common';
import { isLeader } from '@npac/shared';
import { ENV, type Env } from '../config/env.js';
import { AllowIncomplete } from '../auth/public.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';

@Controller('me')
export class MeController {
  constructor(@Inject(ENV) private readonly env: Env) {}
  @Get()
  @AllowIncomplete()
  me(@CurrentUser() u: SessionUser) {
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      canProspect: u.canProspect,
      canClose: u.canClose,
      twoFactorEnabled: u.twoFactorEnabled,
      mustChangePassword: u.mustChangePassword,
      /** HEAD ainda precisa configurar o autenticador (falso se o MFA estiver desligado no dev). */
      mfaPending: this.env.MFA_REQUIRED && isLeader(u.role) && !u.twoFactorEnabled,
    };
  }
}
