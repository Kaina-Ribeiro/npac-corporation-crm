import {
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  auditLog,
  formResponses,
  leads,
  pipelineStages,
  user,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  FORM_LEAD_SOURCE,
  INCOME_DISCOVERY_STAGE,
  LEADER_ROLES,
  normalizeEmail,
  normalizeInstagram,
  normalizePhoneBR,
  TIER_BY_INCOME_BAND,
  type AuthUser,
  type FormResponseDTO,
  type IncomeBand,
  type Role,
} from '@npac/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { recordActivity } from '../leads/activity.js';
import { PushService } from '../push/push.service.js';

export const FORM_INCOME_BANDS = [
  'R5_8K',
  'R8_15K',
  'R15_50K',
  'R50K_PLUS',
  'BELOW_5K',
  'UNKNOWN',
] as const;

export interface FormSubmission {
  responseId: string;
  submittedAt: Date;
  name: string;
  phone?: string | undefined;
  instagram?: string | undefined;
  email?: string | undefined;
  incomeBand: (typeof FORM_INCOME_BANDS)[number];
  answers: { q: string; a: string }[];
}

export type FormStatus = 'linked' | 'created' | 'discarded' | 'duplicate';
type Outcome = { status: FormStatus; lead?: { id: string; ownerId: string } };

const digest = (v: string) => createHash('sha256').update(v).digest();

@Injectable()
export class FormsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly crypto: FieldCrypto,
    private readonly push: PushService,
  ) {}

  /** Sem token configurado ou com token errado, a rota não existe (404). */
  assertToken(given: string | undefined) {
    const expected = this.env.FORMS_WEBHOOK_TOKEN;
    if (!expected || !given || !timingSafeEqual(digest(given), digest(expected)))
      throw new NotFoundException();
  }

  /** Dono dos leads criados. Validado antes de tudo: um envio de teste confirma a configuração. */
  private async owner(): Promise<AuthUser> {
    const username = this.env.FORMS_OWNER_USERNAME;
    const [found] = username
      ? await this.db
          .select({
            id: user.id,
            role: user.role,
            active: user.active,
            canProspect: user.canProspect,
            canClose: user.canClose,
          })
          .from(user)
          .where(eq(user.username, username))
      : [];
    if (!found?.active || !found.canProspect) {
      await this.db
        .insert(auditLog)
        .values({ action: 'form.owner_invalid', entityType: 'form', data: {} });
      throw new ServiceUnavailableException('Integração do formulário mal configurada');
    }
    return { ...found, role: found.role as Role };
  }

  async receive(input: FormSubmission): Promise<{ status: FormStatus }> {
    const owner = await this.owner();
    const phone = input.phone ? normalizePhoneBR(input.phone) : null;
    const instagram = input.instagram ? normalizeInstagram(input.instagram) : null;
    const typedEmail = input.email ? normalizeEmail(input.email) : '';
    const email = z.email().safeParse(typedEmail).success ? typedEmail : null;
    const phoneBidx = phone ? this.crypto.blindIndex(phone) : null;
    const emailBidx = email ? this.crypto.blindIndex(email) : null;

    const result = await withUser(this.db, owner.id, async (tx): Promise<Outcome> => {
      // Mesma ordem do cadastro: dois envios do mesmo contato não criam dois leads.
      const locks = [
        phoneBidx && `phone:${phoneBidx}`,
        instagram && `instagram:${instagram}`,
        emailBidx && `email:${emailBidx}`,
        `form:${input.responseId}`,
      ]
        .filter((v): v is string => Boolean(v))
        .sort();
      for (const key of locks)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);

      const [seen] = await tx.execute<{ seen: boolean }>(
        sql`select form_response_seen(${input.responseId}) as seen`,
      );
      if (seen?.seen) return { status: 'duplicate' };

      const [match] = await tx.execute<{ id: string | null }>(
        sql`select form_find_lead(${phoneBidx}::text, ${instagram}::text, ${emailBidx}::text) as id`,
      );
      if (match?.id) {
        const ownerId = await this.record(tx, match.id, input);
        return ownerId
          ? { status: 'linked', lead: { id: match.id, ownerId } }
          : { status: 'duplicate' };
      }

      const band = input.incomeBand;
      if (band === 'BELOW_5K' || band === 'UNKNOWN' || (!phone && !instagram)) {
        const reason =
          band === 'BELOW_5K' ? 'LOW_INCOME' : band === 'UNKNOWN' ? 'UNKNOWN_INCOME' : 'NO_CONTACT';
        await tx.insert(auditLog).values({
          actorId: owner.id,
          action: 'form.discarded',
          entityType: 'form',
          data: { reason },
        });
        return { status: 'discarded' };
      }

      const id = await this.createLead(tx, owner, input, band, {
        phone,
        phoneBidx,
        instagram,
        email,
        emailBidx,
      });
      await this.record(tx, id, input);
      return { status: 'created', lead: { id, ownerId: owner.id } };
    }).catch((e: unknown) => {
      // O erro do driver traz os parâmetros da consulta (nome, Instagram): não pode chegar aos logs.
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException('Falha ao gravar o formulário');
    });

    if (result.lead) await this.alert(result.lead.id, result.lead.ownerId);
    return { status: result.status };
  }

  private async createLead(
    tx: Tx,
    owner: AuthUser,
    input: FormSubmission,
    band: Exclude<IncomeBand, 'DESCOBRINDO'>,
    contact: {
      phone: string | null;
      phoneBidx: string | null;
      instagram: string | null;
      email: string | null;
      emailBidx: string | null;
    },
  ) {
    const [stage] = await tx
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(eq(pipelineStages.key, INCOME_DISCOVERY_STAGE));
    const [created] = await tx
      .insert(leads)
      .values({
        name: input.name,
        phoneEnc: contact.phone ? this.crypto.encrypt(contact.phone) : null,
        phoneBidx: contact.phoneBidx,
        instagram: contact.instagram,
        emailEnc: contact.email ? this.crypto.encrypt(contact.email) : null,
        emailBidx: contact.emailBidx,
        incomeBand: band,
        source: FORM_LEAD_SOURCE,
        tier: TIER_BY_INCOME_BAND[band],
        stageId: stage!.id,
        sdrId: owner.id,
        createdBy: owner.id,
      })
      .returning({ id: leads.id });
    await recordActivity(tx, owner, created!.id, 'lead.created');
    return created!.id;
  }

  /** Grava resposta, timeline e auditoria; devolve o dono do lead, ou null se já existia. */
  private async record(tx: Tx, leadId: string, input: FormSubmission) {
    const answers = this.crypto.encrypt(JSON.stringify(input.answers));
    const [row] = await tx.execute<{ owner: string | null }>(
      sql`select form_response_record(${input.responseId}, ${leadId}::uuid, ${answers}, ${input.submittedAt.toISOString()}::timestamptz) as owner`,
    );
    return row?.owner ?? null;
  }

  /** Push ao dono e à liderança, sem nome nem contato. */
  private async alert(leadId: string, ownerId: string) {
    const leaders = await this.db
      .select({ id: user.id })
      .from(user)
      .where(and(inArray(user.role, [...LEADER_ROLES]), eq(user.active, true)));
    await this.push.notify([ownerId, ...leaders.map((u) => u.id)], {
      title: 'Novo formulário preenchido',
      url: `/leads/${leadId}`,
      tag: `form-${leadId}`,
    });
  }

  /** Respostas do lead, para quem o enxerga (RLS); invisível e inexistente dão 404. */
  list(u: AuthUser, leadId: string): Promise<FormResponseDTO[]> {
    return withUser(this.db, u.id, async (tx) => {
      const [lead] = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
      if (!lead) throw new NotFoundException();
      const rows = await tx
        .select()
        .from(formResponses)
        .where(eq(formResponses.leadId, leadId))
        .orderBy(desc(formResponses.submittedAt))
        .limit(20);
      await tx.insert(auditLog).values({
        actorId: u.id,
        action: 'form.view',
        entityType: 'lead',
        entityId: leadId,
        data: { count: rows.length },
      });
      return rows.flatMap((r) =>
        r.answersEnc
          ? [
              {
                id: r.id,
                submittedAt: r.submittedAt.toISOString(),
                answers: JSON.parse(
                  this.crypto.decrypt(r.answersEnc),
                ) as FormResponseDTO['answers'],
              },
            ]
          : [],
      );
    });
  }
}
