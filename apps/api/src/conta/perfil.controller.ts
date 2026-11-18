import { BadRequestException, Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { user, type Db } from '@npac/db';
import { cleanProfileName, PROFILE_NAME_ERROR, type ProfileDTO } from '@npac/shared';
import { eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { MAIL_SENDER, type MailSender } from '../mail/mail.js';
import { photoUrl } from './photo-url.js';

/** Meu perfil (NPAC-53): a própria conta. `user` não tem RLS; a guarda é a sessão. */
@AllRoles()
@Controller('me/profile')
export class PerfilController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async ler(@CurrentUser() u: SessionUser): Promise<ProfileDTO> {
    const [row] = await this.db
      .select({ name: user.name, username: user.username, email: user.email, image: user.image })
      .from(user)
      .where(eq(user.id, u.id));
    return {
      name: row!.name,
      username: row!.username ?? '',
      email: row!.email,
      photo: photoUrl(u.id, row!.image),
      mailEnabled: this.mail.enabled,
    };
  }

  @Patch()
  async trocarNome(@CurrentUser() u: SessionUser, @Body() body: unknown): Promise<ProfileDTO> {
    const name = cleanProfileName((body as { name?: unknown } | null)?.name);
    if (!name) throw new BadRequestException(PROFILE_NAME_ERROR);
    await this.db.transaction(async (tx) => {
      await tx.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, u.id));
      // Sem o nome: a auditoria nunca leva dado pessoal.
      await this.audit.record(
        { actorId: u.id, action: 'user.name_changed', entityType: 'user', entityId: u.id },
        tx,
      );
    });
    return this.ler(u);
  }
}
