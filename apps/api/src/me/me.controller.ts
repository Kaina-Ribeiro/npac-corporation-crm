import { Controller, Get, Inject } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { lerMinhaConta } from '../admin/areas.js';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { AllowIncomplete } from '../auth/public.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { photoUrl } from '../conta/photo-url.js';
import { DB } from '../common/db/db.module.js';
import { RevisionService } from '../events/revision.service.js';

@AllRoles()
@Controller('me')
export class MeController {
  constructor(
    private readonly revision: RevisionService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Get()
  @AllowIncomplete()
  async me(@CurrentUser() u: SessionUser) {
    // Fonte do cargo (NPAC-54): Diretoria (`mestre`) e vínculos por área; `role` é o resumo.
    const eu = await withUser(this.db, u.id, (tx) => lerMinhaConta(tx, u.id));
    return {
      id: u.id,
      name: u.name,
      photo: photoUrl(u.id, u.image),
      role: u.role,
      mestre: eu.mestre,
      areas: eu.areas,
      canProspect: u.canProspect,
      canClose: u.canClose,
      twoFactorEnabled: u.twoFactorEnabled,
      mustChangePassword: u.mustChangePassword,
      // Módulos além do comercial: o web mostra a entrada só para quem tem acesso.
      modules: {
        mentoria: eu.mestre || eu.areas.some((a) => a.area === 'ACOMPANHAMENTO'),
      },
      // Contador do canal ao vivo no momento do render: a aba o devolve ao conectar em
      // /api/events e só recarrega se algo mudou desde então (sem dado nenhum: é um número global).
      revision: await this.revision.read(),
    };
  }
}
