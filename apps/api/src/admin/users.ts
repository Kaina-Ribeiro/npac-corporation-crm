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
  mentoriaPerfis,
  session,
  twoFactor,
  user,
  withUser,
  type Db,
} from '@npac/db';
import {
  isLeader,
  userChangeSchema,
  userInviteSchema,
  type AuthUser,
  type Perfil,
  type Role,
  type UserChange,
  type UserInvite,
} from '@npac/shared';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { ReminderScheduler } from '../push/reminders.js';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { validate } from '../common/validate.js';
import { camposDoCargo, cargoAtual, gravarPerfil, resolverOuRecusar } from './cargo.js';

const CAMPOS_DO_CARGO = ['role', 'perfil', 'moduloAdmin', 'canProspect', 'canClose'] as const;

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
    private readonly reminders: ReminderScheduler,
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
    // Perfil do Acompanhamento: só a Diretoria (Admin do módulo) lê pela RLS de mentoria_perfis.
    const perfis =
      actor.role === 'DIRETOR'
        ? await withUser(this.db, actor.id, (tx) =>
            tx
              .select({
                id: mentoriaPerfis.userId,
                perfil: mentoriaPerfis.perfil,
                admin: mentoriaPerfis.admin,
              })
              .from(mentoriaPerfis),
          )
        : [];
    const perfilDe = new Map(perfis.map((p) => [p.id, p]));
    return rows.map((r) => {
      const p = perfilDe.get(r.id);
      const veAcomp = actor.role === 'DIRETOR' && r.role === 'ACOMPANHAMENTO';
      return {
        ...r,
        perfil: veAcomp ? ((p?.perfil as Perfil | undefined) ?? null) : null,
        moduloAdmin: veAcomp ? (p?.admin ?? false) : null,
        leads: byUser.get(r.id) ?? 0,
      };
    });
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
    // Os lembretes seguem o novo dono.
    void this.reminders.rearm();
    return { moved };
  }

  /**
   * Cargo de liderança (Diretoria ou Head) só a Diretoria dá, tira ou administra: o Head
   * gerencia SDRs e closers, mas não cria outro Head nem mexe na conta de um.
   */
  async guardLeadership(actor: AuthUser, targetId: string | null, newRole?: Role) {
    if (actor.role === 'DIRETOR') return;
    if (newRole && isLeader(newRole))
      throw new ForbiddenException('Só a Diretoria pode dar cargo de Head ou Diretoria');
    // Acompanhamento lê dados sensíveis de mentorados: só a Diretoria concede (D10).
    if (newRole === 'ACOMPANHAMENTO')
      throw new ForbiddenException('Só a Diretoria pode dar cargo de Acompanhamento');
    if (!targetId) return;
    const [target] = await this.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, targetId));
    if (!target) throw new NotFoundException();
    if (isLeader(target.role))
      throw new ForbiddenException('Só a Diretoria administra contas de Head ou Diretoria');
    if (target.role === 'ACOMPANHAMENTO')
      throw new ForbiddenException('Só a Diretoria administra contas de Acompanhamento');
  }

  async invite(actor: AuthUser, input: UserInvite) {
    await this.guardLeadership(actor, null, input.role);
    const { perfil, moduloAdmin, canProspect, canClose, ...conta } = input;
    const cargo = resolverOuRecusar({
      role: input.role,
      perfil,
      moduloAdmin,
      canProspect,
      canClose,
    });
    const password = temporaryPassword();
    const id = randomUUID();
    const passwordHash = await hash(password);
    await this.db
      .transaction(async (tx) => {
        await tx.insert(user).values({
          id,
          ...conta,
          role: cargo.role,
          canProspect: cargo.canProspect,
          canClose: cargo.canClose,
          displayUsername: input.username,
          mustChangePassword: true,
        });
        await gravarPerfil(tx, this.audit, actor.id, id, cargo);
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
    await this.record(actor, 'admin.user.invite', id, camposDoCargo(cargo));
    return { id, temporaryPassword: password };
  }

  async update(actor: AuthUser, id: string, input: UserChange) {
    if (id === actor.id && (input.active === false || (input.role && input.role !== actor.role)))
      throw new BadRequestException('Você não pode remover o próprio cargo');
    await this.guardLeadership(actor, id, input.role);
    const { perfil, moduloAdmin, canProspect, canClose, role, ...resto } = input;
    const mexeNoCargo = CAMPOS_DO_CARGO.some((k) => input[k] !== undefined);
    const fields: string[] = Object.keys(input);
    // app.user_id na transação: o perfil do módulo é lido e gravado pela RLS de quem faz.
    await withUser(this.db, actor.id, async (tx) => {
      const antes = await cargoAtual(tx, id);
      if (!antes) throw new NotFoundException();
      const cargo = mexeNoCargo
        ? resolverOuRecusar(
            { role: role ?? antes.role, perfil, moduloAdmin, canProspect, canClose },
            antes,
          )
        : undefined;
      const set = cargo
        ? { ...resto, role: cargo.role, canProspect: cargo.canProspect, canClose: cargo.canClose }
        : resto;
      if (Object.keys(set).length) await tx.update(user).set(set).where(eq(user.id, id));
      if (cargo) {
        fields.push('canProspect', 'canClose');
        if (await gravarPerfil(tx, this.audit, actor.id, id, cargo, antes))
          fields.push('perfil', 'moduloAdmin');
      }
      if (input.active === false) {
        await tx.delete(session).where(eq(session.userId, id));
        // Avisos no aparelho também param (push_purge_user exige liderança na RLS).
        await tx.execute(sql`select push_purge_user(${id})`);
      }
    });
    await this.record(actor, 'admin.user.update', id, [...new Set(fields)]);
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
    return this.users.invite(u, validate(userInviteSchema, body));
  }
  @Patch(':id') update(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.users.update(u, id, validate(userChangeSchema, body));
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
