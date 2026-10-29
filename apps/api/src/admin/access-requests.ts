import { randomUUID } from 'node:crypto';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { accessRequests, account, user, type Db } from '@npac/db';
import { ROLES, type AuthUser } from '@npac/shared';
import { and, asc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { accessRequestCutoff } from '../auth/request-access.js';
import { DB } from '../common/db/db.module.js';
import { validate } from '../common/validate.js';
import { AdminUsersService } from './users.js';

const approval = z
  .object({ role: z.enum(ROLES), canProspect: z.boolean(), canClose: z.boolean() })
  .strict();

/** Pedidos de acesso feitos na tela de login: a liderança aprova (escolhendo o cargo) ou recusa. */
@Injectable()
export class AccessRequestsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly users: AdminUsersService,
  ) {}

  list() {
    return this.db
      .select({
        id: accessRequests.id,
        name: accessRequests.name,
        username: accessRequests.username,
        email: accessRequests.email,
        createdAt: accessRequests.createdAt,
      })
      .from(accessRequests)
      .where(gte(accessRequests.createdAt, accessRequestCutoff()))
      .orderBy(asc(accessRequests.createdAt));
  }

  /** Cria a conta com a senha que a própria pessoa escolheu e apaga o pedido. */
  async approve(actor: AuthUser, id: string, input: z.output<typeof approval>) {
    await this.users.guardLeadership(actor, null, input.role);
    const userId = randomUUID();
    await this.db
      .transaction(async (tx) => {
        // Apagar primeiro trava o pedido (aprovação dupla não cria duas contas); se a conta
        // não puder ser criada, o rollback devolve o pedido.
        const [req] = await tx
          .delete(accessRequests)
          .where(
            and(eq(accessRequests.id, id), gte(accessRequests.createdAt, accessRequestCutoff())),
          )
          .returning();
        if (!req) throw new NotFoundException();
        await tx.insert(user).values({
          id: userId,
          name: req.name,
          email: req.email,
          username: req.username,
          displayUsername: req.username,
          ...input,
          mustChangePassword: false,
        });
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: req.passwordHash,
        });
      })
      .catch((e: { code?: string; cause?: { code?: string } }) => {
        if ((e.cause?.code ?? e.code) === '23505')
          throw new ConflictException('E-mail ou usuário já cadastrado');
        throw e;
      });
    await this.record(actor, 'admin.access_request.approve', id, Object.keys(input));
    return { id: userId };
  }

  async reject(actor: AuthUser, id: string) {
    const rows = await this.db
      .delete(accessRequests)
      .where(eq(accessRequests.id, id))
      .returning({ id: accessRequests.id });
    if (!rows.length) throw new NotFoundException();
    await this.record(actor, 'admin.access_request.reject', id);
  }

  private record(actor: AuthUser, action: string, id: string, fields?: string[]) {
    return this.audit.record({
      actorId: actor.id,
      action,
      entityType: 'access_request',
      entityId: id,
      data: fields ? { fields } : undefined,
    });
  }
}

@Controller('admin/access-requests')
@Can('admin:manage')
export class AccessRequestsController {
  constructor(private readonly requests: AccessRequestsService) {}
  @Get() list() {
    return this.requests.list();
  }
  @Post(':id/approve') approve(
    @CurrentUser() u: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.requests.approve(u, id, validate(approval, body));
  }
  @Delete(':id') @HttpCode(204) reject(
    @CurrentUser() u: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requests.reject(u, id);
  }
}
