import { Controller, Get } from '@nestjs/common';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { AllowIncomplete } from '../auth/public.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { RevisionService } from '../events/revision.service.js';

@AllRoles()
@Controller('me')
export class MeController {
  constructor(private readonly revision: RevisionService) {}

  @Get()
  @AllowIncomplete()
  async me(@CurrentUser() u: SessionUser) {
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
      // Contador do canal ao vivo no momento do render: a aba o devolve ao conectar em
      // /api/events e só recarrega se algo mudou desde então (sem dado nenhum: é um número global).
      revision: await this.revision.read(),
    };
  }
}
