import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import {
  account,
  leads,
  leadTimeline,
  session,
  twoFactor,
  user,
  withUser,
  type Db,
} from '@npac/db';
import { isLeader, ROLES, type AuthUser, type Role } from '@npac/shared';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { validate } from '../common/validate.js';

const invite = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().trim().toLowerCase().max(200),
    // Mesmo formato aceito pelo login (plugin username do Better Auth), sempre minúsculo.
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_.]{3,30}$/, 'Use 3 a 30 letras, números, ponto ou _'),
    role: z.enum(ROLES),
    canProspect: z.boolean(),
    canClose: z.boolean(),
  })
  .strict();
const change = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: z.enum(ROLES),
    canProspect: z.boolean(),
    canClose: z.boolean(),
    active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Informe alteração');

/** Senha temporária mostrada uma única vez a quem administra; o titular troca no primeiro acesso. */
const temporaryPassword = () => randomBytes(12).toString('base64url');

/**
 * Usuários não têm RLS (o Better Auth também os lê como npac_app); o guarda é a
 * permissão `admin:manage`, e cada alteração é auditada sem dados pessoais.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser) {
    // Leads abertos de cada SDR (para redistribuir quando alguém sai). Leads têm RLS: lê como quem pediu.
    const owned = await withUser(this.db, actor.id, (tx) =>
      tx
        .select({ id: leads.sdrId, n: count() })
        .from(leads)
        .where(isNull(leads.deletedAt))
        .groupBy(leads.sdrId),
    );
    const byUser = new Map(owned.map((o) => [o.id, o.n]));
    const rows = await this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        canProspect: user.canProspect,
        canClose: user.canClose,
        active: user.active,
        twoFactorEnabled: user.twoFactorEnabled,
        mustChangePassword: user.mustChangePassword,
      })
      .from(user)
      .orderBy(asc(user.active), asc(user.name));
    return rows.map((r) => ({ ...r, leads: byUser.get(r.id) ?? 0 }));
  }

  /** Passa todos os leads abertos de um SDR para outro (ex.: quem saiu da empresa). */
  async transferLeads(actor: AuthUser, from: string, to: string) {
    const moved = await withUser(this.db, actor.id, async (tx) => {
      const [target] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.id, to), eq(user.active, true), eq(user.canProspect, true)));
      if (!target || to === from)
        throw new BadRequestException('Escolha um SDR ativo que prospecta');
      const rows = await tx
        .update(leads)
        .set({ sdrId: to, updatedAt: new Date(), version: sql`${leads.version} + 1` })
        .where(and(eq(leads.sdrId, from), isNull(leads.deletedAt)))
        .returning({ id: leads.id });
      if (rows.length)
        await tx.insert(leadTimeline).values(
          rows.map((r) => ({
            leadId: r.id,
            actorId: actor.id,
            kind: 'lead.reassigned',
            fields: ['sdrId'],
          })),
        );
      return rows.length;
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'admin.user.transfer_leads',
      entityType: 'user',
      entityId: from,
      data: { to, moved },
    });
    return { moved };
  }

  /**
   * Cargo de liderança (Diretoria ou Head) só a Diretoria dá, tira ou administra: o Head
   * gerencia SDRs e closers, mas não cria outro Head nem mexe na conta de um.
   */
  private async guardLeadership(actor: AuthUser, targetId: string | null, newRole?: Role) {
    if (actor.role === 'DIRETOR') return;
    if (newRole && isLeader(newRole))
      throw new ForbiddenException('Só a Diretoria pode dar cargo de Head ou Diretoria');
    if (!targetId) return;
    const [target] = await this.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, targetId));
    if (!target) throw new NotFoundException();
    if (isLeader(target.role))
      throw new ForbiddenException('Só a Diretoria administra contas de Head ou Diretoria');
  }

  async invite(actor: AuthUser, input: z.output<typeof invite>) {
    await this.guardLeadership(actor, null, input.role);
    const password = temporaryPassword();
    const id = randomUUID();
    const passwordHash = await hash(password);
    await this.db
      .transaction(async (tx) => {
        await tx
          .insert(user)
          .values({ id, ...input, displayUsername: input.username, mustChangePassword: true });
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: id,
          providerId: 'credential',
          userId: id,
          password: passwordHash,
        });
      })
      .catch((e: { code?: string; cause?: { code?: string } }) => {
        if ((e.cause?.code ?? e.code) === '23505')
          throw new ConflictException('E-mail ou usuário já cadastrado');
        throw e;
      });
    await this.record(actor, 'admin.user.invite', id, ['role', 'canProspect', 'canClose']);
    return { id, temporaryPassword: password };
  }

  async update(actor: AuthUser, id: string, input: z.output<typeof change>) {
    if (id === actor.id && (input.active === false || (input.role && input.role !== actor.role)))
      throw new BadRequestException('Você não pode remover o próprio cargo');
    await this.guardLeadership(actor, id, input.role);
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(user)
        .set(input)
        .where(eq(user.id, id))
        .returning({ id: user.id });
      if (!row) throw new NotFoundException();
      if (input.active === false) await tx.delete(session).where(eq(session.userId, id));
    });
    await this.record(actor, 'admin.user.update', id, Object.keys(input));
    return { id };
  }

  async resetPassword(actor: AuthUser, id: string) {
    await this.guardLeadership(actor, id);
    const password = temporaryPassword();
    const passwordHash = await hash(password);
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(user)
        .set({ mustChangePassword: true })
        .where(eq(user.id, id))
        .returning({ id: user.id });
      if (!row) throw new NotFoundException();
      await tx
        .update(account)
        .set({ password: passwordHash })
        .where(and(eq(account.userId, id), eq(account.providerId, 'credential')));
      await tx.delete(session).where(eq(session.userId, id));
    });
    await this.record(actor, 'admin.user.reset_password', id);
    return { temporaryPassword: password };
  }

  async resetMfa(actor: AuthUser, id: string) {
    await this.guardLeadership(actor, id);
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(user)
        .set({ twoFactorEnabled: false })
        .where(eq(user.id, id))
        .returning({ id: user.id });
      if (!row) throw new NotFoundException();
      await tx.delete(twoFactor).where(eq(twoFactor.userId, id));
      await tx.delete(session).where(eq(session.userId, id));
    });
    await this.record(actor, 'admin.user.reset_mfa', id);
    return { id };
  }

  private record(actor: AuthUser, action: string, id: string, fields?: string[]) {
    return this.audit.record({
      actorId: actor.id,
      action,
      entityType: 'user',
      entityId: id,
      data: fields ? { fields } : undefined,
    });
  }
}

@Controller('admin/users')
@Can('admin:manage')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get() list(@CurrentUser() u: SessionUser) {
    return this.users.list(u);
  }
  @Post(':id/transfer-leads') @HttpCode(200) transferLeads(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.users.transferLeads(
      u,
      id,
      validate(z.object({ to: z.string().min(1) }).strict(), body).to,
    );
  }
  @Post() invite(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.users.invite(u, validate(invite, body));
  }
  @Patch(':id') update(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.users.update(u, id, validate(change, body));
  }
  @Post(':id/reset-password') @HttpCode(200) resetPassword(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
  ) {
    return this.users.resetPassword(u, id);
  }
  @Post(':id/reset-mfa') @HttpCode(200) resetMfa(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
  ) {
    return this.users.resetMfa(u, id);
  }
}
