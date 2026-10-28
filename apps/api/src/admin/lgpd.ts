import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { lgpdRequests, user, withUser, type Db } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { DB } from '../common/db/db.module.js';
import { entityId, validate } from '../common/validate.js';

const create = z
  .object({
    kind: z.enum(['ACCESS', 'CORRECTION', 'DELETION']),
    leadId: z.uuid().optional(),
    description: z.string().trim().min(1).max(2000),
  })
  .strict();
const resolve = z
  .object({
    status: z.enum(['DONE', 'REJECTED']),
    resolution: z.string().trim().min(1).max(2000),
  })
  .strict();

/** Pedidos do titular: acesso exporta, eliminação anonimiza, tudo auditado. */
@Injectable()
export class LgpdService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
  ) {}

  list(u: AuthUser) {
    return withUser(this.db, u.id, (tx) =>
      tx
        .select({
          id: lgpdRequests.id,
          kind: lgpdRequests.kind,
          status: lgpdRequests.status,
          leadId: lgpdRequests.leadId,
          description: lgpdRequests.description,
          resolution: lgpdRequests.resolution,
          createdAt: lgpdRequests.createdAt,
          dueAt: lgpdRequests.dueAt,
          resolvedAt: lgpdRequests.resolvedAt,
          createdByName: user.name,
        })
        .from(lgpdRequests)
        .innerJoin(user, eq(user.id, lgpdRequests.createdBy))
        .orderBy(desc(sql`${lgpdRequests.status} = 'OPEN'`), lgpdRequests.dueAt),
    );
  }

  async create(u: AuthUser, input: z.output<typeof create>) {
    if (input.kind !== 'CORRECTION' && !input.leadId)
      throw new BadRequestException('Vincule o pedido a um lead');
    const [row] = await withUser(this.db, u.id, async (tx) => {
      if (input.leadId) {
        const lead = await tx.execute(sql`select 1 from leads where id = ${input.leadId}`);
        if (!lead.length) throw new BadRequestException('Lead inexistente');
      }
      return tx
        .insert(lgpdRequests)
        .values({ ...input, createdBy: u.id })
        .returning({ id: lgpdRequests.id });
    });
    await this.audit.record({
      actorId: u.id,
      action: 'lgpd.request',
      entityType: 'lgpd_request',
      entityId: row!.id,
      data: { kind: input.kind, leadId: input.leadId ?? null },
    });
    return row!;
  }

  async resolve(u: AuthUser, id: string, input: z.output<typeof resolve>) {
    await withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.select().from(lgpdRequests).where(eq(lgpdRequests.id, id)).for('update');
      if (!r) throw new NotFoundException();
      if (r.status !== 'OPEN') throw new ConflictException('Pedido já encerrado');
      if (r.kind === 'DELETION' && input.status === 'DONE' && r.leadId)
        await tx.execute(sql`select lgpd_anonymize_lead(${r.leadId}::uuid)`);
      await tx
        .update(lgpdRequests)
        .set({ ...input, resolvedBy: u.id, resolvedAt: new Date() })
        .where(eq(lgpdRequests.id, id));
    });
    await this.audit.record({
      actorId: u.id,
      action: 'lgpd.resolve',
      entityType: 'lgpd_request',
      entityId: id,
      data: { status: input.status },
    });
    return { id };
  }

  /** Cópia dos dados do titular (art. 18, II), lida como HEAD dentro da RLS. */
  async export(u: AuthUser, id: string) {
    const data = await withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.select().from(lgpdRequests).where(eq(lgpdRequests.id, id));
      if (!r?.leadId) throw new NotFoundException();
      const q = <T extends Record<string, unknown>>(s: ReturnType<typeof sql>) =>
        tx.execute<T>(s).then((rows) => [...rows]);
      const [lead] = await q<{
        id: string;
        name: string;
        phone_enc: Buffer | null;
        instagram: string | null;
        income_band: string;
        source: string;
        tier: string;
        summary: string | null;
        legal_basis: string;
        created_at: Date;
        anonymized_at: Date | null;
      }>(sql`select id, name, phone_enc, instagram, income_band, source, tier, summary, legal_basis,
        created_at, anonymized_at from leads where id = ${r.leadId}`);
      if (!lead) throw new NotFoundException();
      return {
        generatedAt: new Date().toISOString(),
        controller: 'NPAC Corporation',
        lead: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone_enc ? this.crypto.decrypt(lead.phone_enc) : null,
          instagram: lead.instagram,
          incomeBand: lead.income_band,
          source: lead.source,
          tier: lead.tier,
          summary: lead.summary,
          legalBasis: lead.legal_basis,
          createdAt: lead.created_at,
          anonymizedAt: lead.anonymized_at,
        },
        notes: await q(
          sql`select body, created_at from lead_notes where lead_id = ${r.leadId} order by created_at`,
        ),
        tasks: await q(
          sql`select title, due_at, completed_at from lead_tasks where lead_id = ${r.leadId} order by created_at`,
        ),
        meetings: await q(
          sql`select scheduled_at, origin, outcome, canceled_at from meetings where lead_id = ${r.leadId} order by scheduled_at`,
        ),
        purchases: await q(
          sql`select product_name, total_cents, method, closed_at, reversed_at from deals where lead_id = ${r.leadId} order by closed_at`,
        ),
        history: await q(
          sql`select kind, fields, at from lead_timeline where lead_id = ${r.leadId} order by at`,
        ),
      };
    });
    await this.audit.record({
      actorId: u.id,
      action: 'lgpd.export',
      entityType: 'lgpd_request',
      entityId: id,
    });
    return data;
  }
}

@Controller('admin/lgpd')
@Can('audit:view')
export class LgpdController {
  constructor(private readonly lgpd: LgpdService) {}
  @Get() list(@CurrentUser() u: SessionUser) {
    return this.lgpd.list(u);
  }
  @Post() create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.lgpd.create(u, validate(create, body));
  }
  @Post(':id/resolve') @HttpCode(200) resolve(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.lgpd.resolve(u, entityId(id), validate(resolve, body));
  }
  @Get(':id/export')
  @Header('Content-Disposition', 'attachment; filename="npac-titular.json"')
  export(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.lgpd.export(u, entityId(id));
  }
}
