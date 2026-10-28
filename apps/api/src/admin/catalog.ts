import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { auditLog, pipelineStages, products, user, withUser, type Db, type Tx } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { entityId, validate } from '../common/validate.js';

const cents = z.number().int().positive().max(2_000_000_000);
const productFields = {
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,40}$/),
  name: z.string().trim().min(1).max(120),
  closerId: z.string().min(1),
  priceCents: cents,
  active: z.boolean(),
};
const productCreate = z.object(productFields).omit({ active: true }).strict();
const productUpdate = z
  .object(productFields)
  .omit({ code: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Informe alteração');
const stageUpdate = z.object({ label: z.string().trim().min(1).max(60) }).strict();
const auditQuery = z
  .object({
    action: z.string().max(80).optional(),
    actorId: z.string().max(80).optional(),
    entityId: z.string().max(80).optional(),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .strict();

/** Catálogo, etapas e leitura da auditoria; escrita sujeita à RLS de HEAD. */
@Injectable()
export class AdminCatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  products(u: AuthUser) {
    return withUser(this.db, u.id, (tx) =>
      tx
        .select({
          id: products.id,
          code: products.code,
          name: products.name,
          closerId: products.closerId,
          closerName: user.name,
          priceCents: products.priceCents,
          active: products.active,
        })
        .from(products)
        .innerJoin(user, eq(user.id, products.closerId))
        .orderBy(desc(products.active), asc(products.priceCents)),
    );
  }

  async createProduct(u: AuthUser, input: z.output<typeof productCreate>) {
    const [row] = await withUser(this.db, u.id, async (tx) => {
      await this.assertCloser(tx, input.closerId);
      return tx.insert(products).values(input).returning({ id: products.id });
    }).catch((e: { code?: string; cause?: { code?: string } }) => {
      if ((e.cause?.code ?? e.code) === '23505') throw new ConflictException('Código já usado');
      throw e;
    });
    await this.record(u, 'admin.product.create', 'product', row!.id);
    return row!;
  }

  async updateProduct(u: AuthUser, id: string, input: z.output<typeof productUpdate>) {
    await withUser(this.db, u.id, async (tx) => {
      if (input.closerId) await this.assertCloser(tx, input.closerId);
      const [row] = await tx
        .update(products)
        .set(input)
        .where(eq(products.id, id))
        .returning({ id: products.id });
      if (!row) throw new NotFoundException();
    });
    await this.record(u, 'admin.product.update', 'product', id, Object.keys(input));
    return { id };
  }

  stages(u: AuthUser) {
    return withUser(this.db, u.id, (tx) =>
      tx
        .select({
          id: pipelineStages.id,
          key: pipelineStages.key,
          label: pipelineStages.label,
          position: pipelineStages.position,
        })
        .from(pipelineStages)
        .orderBy(asc(pipelineStages.position)),
    );
  }

  async updateStage(u: AuthUser, id: string, label: string) {
    await withUser(this.db, u.id, async (tx) => {
      const [row] = await tx
        .update(pipelineStages)
        .set({ label })
        .where(eq(pipelineStages.id, id))
        .returning({ id: pipelineStages.id });
      if (!row) throw new NotFoundException();
    });
    await this.record(u, 'admin.stage.update', 'stage', id, ['label']);
    return { id };
  }

  auditLog(u: AuthUser, q: z.output<typeof auditQuery>) {
    const size = 50;
    return withUser(this.db, u.id, async (tx) => {
      const where: SQL[] = [];
      if (q.action) where.push(eq(auditLog.action, q.action));
      if (q.actorId) where.push(eq(auditLog.actorId, q.actorId));
      if (q.entityId) where.push(eq(auditLog.entityId, q.entityId));
      const filter = where.length ? and(...where) : undefined;
      const items = await tx
        .select({
          id: auditLog.id,
          at: auditLog.at,
          action: auditLog.action,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          actorId: auditLog.actorId,
          actorName: user.name,
          data: auditLog.data,
        })
        .from(auditLog)
        .leftJoin(user, eq(user.id, auditLog.actorId))
        .where(filter)
        .orderBy(desc(auditLog.id))
        .limit(size + 1)
        .offset((q.page - 1) * size);
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(filter);
      return {
        items: items.slice(0, size),
        hasMore: items.length > size,
        total: count!.n,
        page: q.page,
      };
    });
  }

  private async assertCloser(tx: Tx, id: string) {
    const [c] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, id), eq(user.active, true), eq(user.canClose, true)));
    if (!c) throw new BadRequestException('Closer inválido');
  }

  private record(u: AuthUser, action: string, type: string, id: string, fields?: string[]) {
    return this.audit.record({
      actorId: u.id,
      action,
      entityType: type,
      entityId: id,
      data: fields ? { fields } : undefined,
    });
  }
}

@Controller('admin')
@Can('admin:manage')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}
  @Get('products') products(@CurrentUser() u: SessionUser) {
    return this.catalog.products(u);
  }
  @Post('products') createProduct(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.catalog.createProduct(u, validate(productCreate, body));
  }
  @Patch('products/:id') updateProduct(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.updateProduct(u, entityId(id), validate(productUpdate, body));
  }
  @Get('stages') stages(@CurrentUser() u: SessionUser) {
    return this.catalog.stages(u);
  }
  @Patch('stages/:id') updateStage(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.updateStage(u, entityId(id), validate(stageUpdate, body).label);
  }
  @Post('audit/search') @HttpCode(200) @Can('audit:view') audit(
    @CurrentUser() u: SessionUser,
    @Body() body: unknown,
  ) {
    return this.catalog.auditLog(u, validate(auditQuery, body));
  }
}
