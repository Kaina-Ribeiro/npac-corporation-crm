import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
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
  type Tx,
} from '@npac/db';
import {
  AREAS,
  areasDeHead,
  can,
  CARGOS,
  hasCommercialAccess,
  podeGerenciar,
  temCaixas,
  userChangeSchema,
  userInviteSchema,
  type Area,
  type AuthUser,
  type Perfil,
  type UserChange,
  type UserInvite,
} from '@npac/shared';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { ReminderScheduler } from '../push/reminders.js';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { MAIL_SENDER, type MailSender } from '../mail/mail.js';
import { inviteMail } from '../mail/templates.js';
import { validate } from '../common/validate.js';
import { photoUrl } from '../conta/photo-url.js';
import { erroDoBanco } from '../mentoria/erros.js';
import {
  aplicar,
  definirMembro,
  definirMestre,
  Gerente,
  lerConta,
  lerContas,
  removerMembro,
  vinculoDoCargo,
} from './areas.js';
import {
  camposDoCargo,
  alcanceOuRecusar,
  cargoAtual,
  cargoNaAuditoria,
  gravarCargoNovo,
  resolverOuRecusar,
} from './cargo.js';

const CAMPOS_DO_CARGO = [
  'role',
  'perfil',
  'moduloAdmin',
  'canProspect',
  'canClose',
  'alcance',
] as const;

/** Campos que escolhem o cargo de uma área (as caixas "Atua como" não: são da conta). */
const CAMPOS_DE_AREA = ['role', 'perfil', 'moduloAdmin', 'alcance'] as const;

/** Conta com as duas áreas: o PATCH da Diretoria não sabe de qual área é o campo Cargo (Fase 4). */
export const MSG_CARGO_POR_AREA = 'Conta em mais de uma área: troque o cargo em cada área';

/** Corpo de `PUT admin/users/:id/areas/:area` (só a Diretoria). */
const areaBodySchema = z.object({ cargo: z.enum(CARGOS), head: z.boolean().optional() }).strict();
export type AreaBody = z.infer<typeof areaBodySchema>;

const areaDaRota = (area: string): Area => {
  if (!(AREAS as readonly string[]).includes(area)) throw new NotFoundException();
  return area as Area;
};

/** Senha temporária mostrada uma única vez a quem administra; o titular troca no primeiro acesso. */
const temporaryPassword = () => randomBytes(12).toString('base64url');

/**
 * Contas por área (NPAC-54, Fase 2). Usuários não têm RLS (o Better Auth também os lê como
 * npac_app): quem pode o quê é a regra única `podeGerenciar`, aplicada aqui e de novo nas funções do
 * banco que gravam o cargo. A Diretoria vê e mexe em tudo; o Head de cada área (Head do Comercial,
 * Admin do Acompanhamento), só nas contas da área dele. Cada alteração é auditada sem dado pessoal.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly reminders: ReminderScheduler,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(actor: AuthUser) {
    // Leads abertos de cada SDR (para redistribuir quando alguém sai). Leads têm RLS: lê como quem
    // pediu; só faz sentido para quem é do comercial.
    const owned = hasCommercialAccess(actor.role)
      ? await withUser(this.db, actor.id, (tx) =>
          tx
            .select({ id: leads.sdrId, n: count() })
            .from(leads)
            .where(isNull(leads.deletedAt))
            .groupBy(leads.sdrId),
        )
      : [];
    const byUser = new Map(owned.map((o) => [o.id, o.n]));
    return withUser(this.db, actor.id, async (tx) => {
      const contas = await lerContas(tx);
      const eu = contas.get(actor.id);
      if (!eu) throw new NotFoundException();
      const heads = areasDeHead(eu);
      const rows = await tx
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
          ultimoUso: user.ultimoUso,
          image: user.image,
        })
        .from(user)
        .orderBy(asc(user.active), asc(user.name));
      return rows.flatMap(({ image, ...r }) => {
        const conta = contas.get(r.id) ?? { mestre: false, areas: [] };
        if (!podeGerenciar({ ator: eu, alvo: conta, acao: 'VER' }).ok) return [];
        // O Head vê só o cargo da área dele; da outra, só que existe (sem dizer qual).
        const areas = eu.mestre ? conta.areas : conta.areas.filter((a) => heads.includes(a.area));
        const ac = areas.find((a) => a.area === 'ACOMPANHAMENTO');
        const semComercial = !heads.includes('COMERCIAL');
        return [
          {
            ...r,
            ...(semComercial
              ? { role: 'ACOMPANHAMENTO' as const, canProspect: false, canClose: false }
              : {}),
            mestre: conta.mestre,
            areas,
            outraArea: !eu.mestre && areas.length < conta.areas.length,
            photo: photoUrl(r.id, image),
            perfil: ac ? ((ac.cargo as Perfil | null) ?? null) : null,
            moduloAdmin: ac ? ac.head : null,
            alcance: ac ? (ac.alcance ?? 'TODOS') : null,
            leads: byUser.get(r.id) ?? 0,
          },
        ];
      });
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

  /** A conta de quem pede (sempre lida: o guarda já exigiu Diretoria ou Head). */
  private async eu(tx: Tx, actor: AuthUser) {
    const eu = await lerConta(tx, actor.id);
    if (!eu) throw new NotFoundException();
    return eu;
  }

  async invite(actor: AuthUser, input: UserInvite) {
    const { perfil, moduloAdmin, canProspect, canClose, alcance, ...conta } = input;
    const pedido = vinculoDoCargo({
      role: input.role,
      perfil: perfil ?? null,
      moduloAdmin: !!moduloAdmin,
    });
    const password = temporaryPassword();
    const id = randomUUID();
    const passwordHash = await hash(password);
    const { cargo, alc } = await withUser(this.db, actor.id, async (tx) => {
      aplicar({
        ator: await this.eu(tx, actor),
        acao: 'CONVIDAR',
        area: pedido.area,
        cargo: pedido.cargo,
        head: pedido.head,
        mestre: pedido.mestre,
      });
      const cargo = resolverOuRecusar({
        role: input.role,
        perfil,
        moduloAdmin,
        canProspect,
        canClose,
      });
      const alc = alcanceOuRecusar(alcance, cargo);
      await tx.insert(user).values({
        id,
        ...conta,
        role: cargo.role,
        canProspect: cargo.canProspect,
        canClose: cargo.canClose,
        displayUsername: input.username,
        mustChangePassword: true,
      });
      await gravarCargoNovo(tx, this.audit, actor.id, id, cargo, alc);
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: id,
        providerId: 'credential',
        userId: id,
        password: passwordHash,
      });
      return { cargo, alc };
    }).catch((e: { code?: string; cause?: { code?: string } }) => {
      if ((e.cause?.code ?? e.code) === '23505')
        throw new ConflictException('E-mail ou usuário já cadastrado');
      throw e;
    });
    await this.record(actor, 'admin.user.invite', id, {
      fields: camposDoCargo(cargo),
      ...cargoNaAuditoria(cargo, alc),
    });
    // Convite por e-mail (19/11, "1A"): usuário, senha temporária e a tela de entrada da área. A tela
    // de quem convida continua mostrando a senha. Sem envio configurado, nada sai.
    const emailEnviado = this.mail.enabled;
    if (emailEnviado) {
      const tela =
        !pedido.mestre && pedido.area === 'ACOMPANHAMENTO' ? '/login/acompanhamento' : '/login';
      void this.mail.send(
        inviteMail(
          input.email,
          input.name,
          input.username,
          password,
          `${this.env.WEB_ORIGIN}${tela}`,
        ),
      );
    }
    return { id, temporaryPassword: password, emailEnviado };
  }

  async update(actor: AuthUser, id: string, input: UserChange) {
    if (id === actor.id && (input.active === false || (input.role && input.role !== actor.role)))
      throw new BadRequestException('Você não pode remover o próprio cargo');
    const { perfil, moduloAdmin, canProspect, canClose, role, alcance, ...resto } = input;
    const mexeNoCargo = CAMPOS_DO_CARGO.some((k) => input[k] !== undefined);
    const fields: string[] = Object.keys(input);
    const r = { audit: this.audit, actorId: actor.id };
    await withUser(this.db, actor.id, async (tx) => {
      const eu = await this.eu(tx, actor);
      const alvo = await lerConta(tx, id);
      if (!alvo) throw new NotFoundException();
      const base = { ator: eu, alvo, proprio: id === actor.id };
      aplicar({ ...base, acao: 'VER' });
      const antes = await cargoAtual(tx, id, alvo);
      if (!antes) throw new NotFoundException();

      // A Diretoria vê os dois cargos da conta: troca cada um pela rota por área. O Head vê só o da
      // área dele e continua trocando por aqui (M5). Dar a Diretoria continua por aqui.
      const porArea = CAMPOS_DE_AREA.some((k) => input[k] !== undefined) && role !== 'DIRETOR';
      if (eu.mestre && alvo.areas.length > 1 && porArea)
        throw new BadRequestException(MSG_CARGO_POR_AREA);

      if (mexeNoCargo) {
        const cargo = resolverOuRecusar(
          { role: role ?? antes.role, perfil, moduloAdmin, canProspect, canClose },
          antes,
        );
        const alc = alcanceOuRecusar(
          alcance,
          cargo,
          alvo.areas.find((a) => a.area === 'ACOMPANHAMENTO')?.alcance,
        );
        const novo = vinculoDoCargo(cargo, cargo.role === 'ACOMPANHAMENTO' ? alc : undefined);
        if (novo.mestre !== alvo.mestre) {
          aplicar({ ...base, acao: 'MESTRE', mestre: novo.mestre });
          await definirMestre(tx, r, id, novo);
        } else if (!novo.mestre) {
          const atual = alvo.areas.find((a) => a.area === novo.area);
          const alcanceMudou =
            novo.area === 'ACOMPANHAMENTO' && (atual?.alcance ?? 'TODOS') !== alc;
          if (!atual || atual.cargo !== novo.cargo || atual.head !== novo.head || alcanceMudou) {
            aplicar({ ...base, acao: 'CARGO', ...novo });
            await definirMembro(tx, r, id, atual, novo);
          }
          // Troca de área (a conta tinha só a outra): sai da antiga. Em conta com as duas áreas o
          // campo Cargo do Head troca só o cargo da área dele (M5); pôr ou tirar área é a rota por
          // área (`definirArea`, `removerArea`).
          const [unica] = alvo.areas;
          if (alvo.areas.length === 1 && unica && unica.area !== novo.area) {
            aplicar({ ...base, acao: 'REMOVER_AREA', area: unica.area });
            await removerMembro(tx, r, id, unica.area);
          }
        }
        // "Atua como SDR/Closer": só Head e Diretoria têm, logo só a Diretoria marca (a própria
        // também: não é cargo). Nos demais cargos o banco já acertou as caixas.
        const caixas = cargo.canProspect !== antes.canProspect || cargo.canClose !== antes.canClose;
        if (temCaixas(cargo.role) && caixas) {
          if (!eu.mestre) aplicar({ ...base, acao: 'CARGO', ...novo });
          await tx
            .update(user)
            .set({ canProspect: cargo.canProspect, canClose: cargo.canClose })
            .where(eq(user.id, id));
        }
        fields.push('canProspect', 'canClose');
        const era = antes.role === 'ACOMPANHAMENTO';
        const fica = cargo.role === 'ACOMPANHAMENTO';
        const perfilMudou =
          (era || fica) &&
          !(
            era &&
            fica &&
            antes.perfil === cargo.perfil &&
            antes.moduloAdmin === cargo.moduloAdmin
          );
        if (perfilMudou) {
          fields.push('perfil', 'moduloAdmin');
          await this.audit.record(
            {
              actorId: actor.id,
              action: 'mentoria.perfil.definido',
              entityType: 'user',
              entityId: id,
              data: {
                perfil: fica ? cargo.perfil : null,
                admin: fica && cargo.moduloAdmin,
                registro: 2,
              },
            },
            tx,
          );
        }
      }

      if (Object.keys(resto).length) {
        // Nome, e-mail, usuário e ativo são da conta inteira: senha, MFA e desativar seguem a mesma
        // regra (conta em duas áreas, só a Diretoria; M5).
        aplicar({ ...base, acao: resto.active === false ? 'DESATIVAR' : 'CONTA' });
        await tx.update(user).set(resto).where(eq(user.id, id));
      }
      if (input.active === false) {
        await tx.delete(session).where(eq(session.userId, id));
        // Avisos no aparelho também param (push_purge_user confere area_gerencia no banco).
        await tx.execute(sql`select push_purge_user(${id})`);
      }
    });
    await this.record(actor, 'admin.user.update', id, {
      fields: [...new Set(fields)],
      registro: 2,
      ...(input.active !== undefined ? { ativo: input.active } : {}),
    });
    return { id };
  }

  /**
   * Pessoa em duas áreas (NPAC-54, Fase 4; spec "API"): só a Diretoria põe alguém numa área, troca
   * o cargo dele ali ou o tira (M4). O Head recebe 404 na conta que não enxerga e 403 com o motivo
   * na que enxerga. O banco repete a regra e recusa cargo de outra área e tirar a última área.
   */
  private async exigirDiretoria(tx: Tx, actor: AuthUser, id: string) {
    const eu = await this.eu(tx, actor);
    const alvo = await lerConta(tx, id);
    if (!alvo) throw new NotFoundException();
    const base = { ator: eu, alvo, proprio: id === actor.id };
    aplicar({ ...base, acao: 'VER' });
    // Pôr e tirar de uma área são a mesma ação "só a Diretoria" (M4); a regra não tem uma ação de pôr.
    aplicar({ ...base, acao: 'REMOVER_AREA' });
    return alvo;
  }

  async definirArea(actor: AuthUser, id: string, rota: string, body: AreaBody) {
    const area = areaDaRota(rota);
    await withUser(this.db, actor.id, async (tx) => {
      const alvo = await this.exigirDiretoria(tx, actor, id);
      const antes = alvo.areas.find((a) => a.area === area);
      const head =
        area === 'COMERCIAL' ? body.cargo === 'HEAD' : (body.head ?? antes?.head ?? false);
      if (antes && antes.cargo === body.cargo && antes.head === head) return;
      await definirMembro(tx, { audit: this.audit, actorId: actor.id }, id, antes, {
        mestre: false,
        area,
        cargo: body.cargo,
        head,
      });
    }).catch((e: unknown) => erroDoBanco(e));
    return { id };
  }

  async removerArea(actor: AuthUser, id: string, rota: string) {
    const area = areaDaRota(rota);
    await withUser(this.db, actor.id, async (tx) => {
      const alvo = await this.exigirDiretoria(tx, actor, id);
      if (!alvo.areas.some((a) => a.area === area)) throw new NotFoundException();
      await removerMembro(tx, { audit: this.audit, actorId: actor.id }, id, area);
    }).catch((e: unknown) => erroDoBanco(e));
    return { id };
  }

  /** Senha e MFA: a regra CONTA (o Head não mexe em outro Head nem em conta com outra área). */
  private async exigirConta(tx: Tx, actor: AuthUser, id: string) {
    const alvo = await lerConta(tx, id);
    if (!alvo) throw new NotFoundException();
    aplicar({ ator: await this.eu(tx, actor), alvo, proprio: id === actor.id, acao: 'CONTA' });
  }

  async resetPassword(actor: AuthUser, id: string) {
    const password = temporaryPassword();
    const passwordHash = await hash(password);
    await withUser(this.db, actor.id, async (tx) => {
      await this.exigirConta(tx, actor, id);
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
    await withUser(this.db, actor.id, async (tx) => {
      await this.exigirConta(tx, actor, id);
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

  private record(actor: AuthUser, action: string, id: string, data?: Record<string, unknown>) {
    return this.audit.record({
      actorId: actor.id,
      action,
      entityType: 'user',
      entityId: id,
      data,
    });
  }
}

/** A Diretoria e o Head de alguma área; transferir leads continua só do comercial (`admin:manage`). */
@Controller('admin/users')
@Gerente()
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
    if (!hasCommercialAccess(u.role)) throw new NotFoundException();
    if (!can(u, 'admin:manage')) throw new ForbiddenException();
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
  @Put(':id/areas/:area') definirArea(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Param('area') area: string,
    @Body() body: unknown,
  ) {
    return this.users.definirArea(u, id, area, validate(areaBodySchema, body));
  }
  @Delete(':id/areas/:area') removerArea(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Param('area') area: string,
  ) {
    return this.users.removerArea(u, id, area);
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
