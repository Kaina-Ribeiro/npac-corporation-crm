import { Controller, Get } from '@nestjs/common';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { AllowIncomplete } from '../auth/public.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';

@AllRoles()
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
      // Módulos além do comercial: o web mostra a entrada só para quem tem acesso.
      modules: { mentoria: u.role === 'DIRETOR' || u.role === 'ACOMPANHAMENTO' },
    };
  }
}
