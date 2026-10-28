import { Controller, Get } from '@nestjs/common';
import { AllowIncomplete } from '../auth/public.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';

@Controller('me')
export class MeController {
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
    };
  }
}
