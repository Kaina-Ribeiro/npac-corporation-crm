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
import { accessRequests, account, user, withUser, type Db } from '@npac/db';
import {
  accessApprovalSchema,
  areasDeHead,
  type AccessApproval,
  type AccessArea,
  type AuthUser,
} from '@npac/shared';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { accessRequestCutoff } from '../auth/request-access.js';
import { DB } from '../common/db/db.module.js';
import { validate } from '../common/validate.js';
import { aplicar, Gerente, lerConta, vinculoDoCargo } from './areas.js';
import {
  alcanceOuRecusar,
  camposDoCargo,
  cargoNaAuditoria,
  gravarCargoNovo,
  resolverOuRecusar,
} from './cargo.js';

/**
 * Pedidos de acesso feitos nas telas de login. A Diretoria vê todos e aprova em qualquer área; o Head
 * de cada área vê e aprova só os da área dele, com cargo dessa área (M9). Quem aprova escolhe o cargo.
 */
@Injectable()
export class AccessRequestsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  list(actor: AuthUser) {
    return withUser(this.db, actor.id, async (tx) => {
      const eu = await lerConta(tx, actor.id);
      const areas = eu ? areasDeHead(eu) : [];
      if (!areas.length) return [];
      return tx
        .select({
          id: accessRequests.id,
          name: accessRequests.name,
          username: accessRequests.username,
          email: accessRequests.email,
          area: accessRequests.area,
          createdAt: accessRequests.createdAt,
        })
        .from(accessRequests)
        .where(
          and(
            gte(accessRequests.createdAt, accessRequestCutoff()),
            inArray(accessRequests.area, areas),
          ),
        )
        .orderBy(asc(accessRequests.createdAt));
    });
  }

  /** Cria a conta com a senha que a própria pessoa escolheu e apaga o pedido. */
  async approve(actor: AuthUser, id: string, input: AccessApproval) {
    const pedido = vinculoDoCargo({
      role: input.role,
      perfil: input.perfil ?? null,
      moduloAdmin: !!input.moduloAdmin,
    });
    const userId = randomUUID();
    const { cargo, area, alc } = await withUser(this.db, actor.id, async (tx) => {
      // Apagar primeiro trava o pedido (aprovação dupla não cria duas contas); recusa da regra, cargo
      // inválido ou conta que não pode ser criada: o rollback devolve o pedido.
      const [req] = await tx
        .delete(accessRequests)
        .where(and(eq(accessRequests.id, id), gte(accessRequests.createdAt, accessRequestCutoff())))
        .returning();
      if (!req) throw new NotFoundException();
      const eu = await lerConta(tx, actor.id);
      if (!eu) throw new NotFoundException();
      aplicar({
        ator: eu,
        acao: 'APROVAR',
        pedidoArea: req.area as AccessArea,
        area: pedido.area,
        cargo: pedido.cargo,
        head: pedido.head,
        mestre: pedido.mestre,
      });
      // Mesmo campo Cargo do convite: caixas pelo cargo e, no Acompanhamento, o perfil junto.
      const cargo = resolverOuRecusar(input);
      const alc = alcanceOuRecusar(input.alcance, cargo);
      await tx.insert(user).values({
        id: userId,
        name: req.name,
        email: req.email,
        username: req.username,
        displayUsername: req.username,
        role: cargo.role,
        canProspect: cargo.canProspect,
        canClose: cargo.canClose,
        mustChangePassword: false,
      });
      await gravarCargoNovo(tx, this.audit, actor.id, userId, cargo, alc);
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: req.passwordHash,
      });
      return { cargo, area: req.area, alc };
    }).catch((e: { code?: string; cause?: { code?: string } }) => {
      if ((e.cause?.code ?? e.code) === '23505')
        throw new ConflictException('E-mail ou usuário já cadastrado');
      throw e;
    });
    // A conta criada vai junto (o registro de acessos mostra o nome dela, lido na hora).
    await this.record(actor, 'admin.access_request.approve', id, {
      fields: camposDoCargo(cargo),
      ...cargoNaAuditoria(cargo, alc),
      pedidoArea: area,
      userId,
    });
    return { id: userId };
  }

  async reject(actor: AuthUser, id: string) {
    const area = await withUser(this.db, actor.id, async (tx) => {
      const [req] = await tx
        .delete(accessRequests)
        .where(eq(accessRequests.id, id))
        .returning({ area: accessRequests.area });
      if (!req) throw new NotFoundException();
      const eu = await lerConta(tx, actor.id);
      if (!eu) throw new NotFoundException();
      aplicar({ ator: eu, acao: 'VER_PEDIDO', pedidoArea: req.area as AccessArea });
      return req.area;
    });
    await this.record(actor, 'admin.access_request.reject', id, { pedidoArea: area });
  }

  private record(actor: AuthUser, action: string, id: string, data: Record<string, unknown>) {
    return this.audit.record({
      actorId: actor.id,
      action,
      entityType: 'access_request',
      entityId: id,
      data,
    });
  }
}

@Controller('admin/access-requests')
@Gerente()
export class AccessRequestsController {
  constructor(private readonly requests: AccessRequestsService) {}
  @Get() list(@CurrentUser() u: SessionUser) {
    return this.requests.list(u);
  }
  @Post(':id/approve') approve(
    @CurrentUser() u: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.requests.approve(u, id, validate(accessApprovalSchema, body));
  }
  @Delete(':id') @HttpCode(204) reject(
    @CurrentUser() u: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requests.reject(u, id);
  }
}
