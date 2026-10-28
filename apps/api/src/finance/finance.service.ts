import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  deals,
  leads,
  payments,
  pipelineStages,
  products,
  user,
  withUser,
  type Db,
} from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { recordActivity } from '../leads/activity.js';
import { lockLead } from '../leads/lead-mutations.service.js';
import type { SaleInput } from './schemas.js';

@Injectable()
export class FinanceService {
  constructor(@Inject(DB) private readonly db: Db) {}
  catalog(u: AuthUser) {
    return withUser(this.db, u.id, (tx) =>
      tx
        .select({
          id: products.id,
          name: products.name,
          closerId: products.closerId,
          closerName: user.name,
          priceCents: products.priceCents,
        })
        .from(products)
        .innerJoin(user, eq(user.id, products.closerId))
        .where(and(eq(products.active, true), eq(user.active, true), eq(user.canClose, true)))
        .orderBy(asc(products.priceCents)),
    );
  }
  list(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      await lockLead(tx, id);
      const rows = await tx
        .select()
        .from(deals)
        .where(eq(deals.leadId, id))
        .orderBy(desc(deals.closedAt));
      return Promise.all(
        rows.map(async (d) => ({
          ...d,
          requestHash: undefined,
          payments: await tx
            .select()
            .from(payments)
            .where(eq(payments.dealId, d.id))
            .orderBy(asc(payments.dueAt), asc(payments.id)),
        })),
      );
    });
  }
  async register(u: AuthUser, input: SaleInput) {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`sale:${input.requestKey}`},0))`,
      );
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const [retry] = await tx.select().from(deals).where(eq(deals.requestKey, input.requestKey));
      if (retry) {
        if (retry.requestHash !== hash)
          throw new ConflictException('Chave já usada em outra requisição');
        return { id: retry.id };
      }
      const lead = await lockLead(tx, input.leadId, input.version);
      if (u.role === 'CLOSER' && input.closerId !== u.id) throw new ForbiddenException();
      const [product] = await tx
        .select({ id: products.id, name: products.name, priceCents: products.priceCents })
        .from(products)
        .innerJoin(user, eq(user.id, products.closerId))
        .where(
          and(
            eq(products.id, input.productId),
            eq(products.closerId, input.closerId),
            eq(products.active, true),
            eq(user.active, true),
            eq(user.canClose, true),
          ),
        );
      if (!product) throw new BadRequestException('Produto/closer inválido');
      const direct = input.method === 'CARD' || input.method === 'PIX';
      if (
        direct
          ? input.installments.length > 0 || input.entryCents !== 0
          : input.installments.length === 0 ||
            input.entryCents + input.installments.reduce((a, p) => a + p.amountCents, 0) !==
              input.totalCents ||
            input.installments.some((p) => p.dueAt.getTime() <= Date.now()) ||
            (input.method === 'PARTIAL'
              ? input.entryCents <= 0 || input.entryCents >= input.totalCents
              : input.entryCents !== 0)
      )
        throw new BadRequestException(
          'Entrada e parcelas precisam fechar o total; vencimentos devem ser futuros',
        );
      const [existing] = await tx
        .select({ id: deals.id })
        .from(deals)
        .where(and(eq(deals.leadId, lead.id), isNull(deals.reversedAt)));
      if (existing) throw new ConflictException('Este lead já tem uma venda ativa');
      const [stage] = await tx
        .select({ id: pipelineStages.id })
        .from(pipelineStages)
        .where(eq(pipelineStages.key, 'VENDA'));
      if (!stage) throw new BadRequestException('Etapa de venda não configurada');
      const [d] = await tx
        .insert(deals)
        .values({
          leadId: lead.id,
          productId: product.id,
          productName: product.name,
          catalogPriceCents: product.priceCents,
          closerId: input.closerId,
          sdrId: lead.sdrId,
          totalCents: input.totalCents,
          method: input.method,
          requestKey: input.requestKey,
          requestHash: hash,
          previousStageId: lead.stageId,
          createdBy: u.id,
        })
        .returning();
      const now = new Date();
      const entry = direct ? input.totalCents : input.entryCents;
      if (entry)
        await tx
          .insert(payments)
          .values({
            dealId: d!.id,
            amountCents: entry,
            dueAt: now,
            paidAt: now,
            paidBy: u.id,
            receiptKey: randomUUID(),
          });
      if (input.installments.length)
        await tx
          .insert(payments)
          .values(
            input.installments.map((p) => ({
              dealId: d!.id,
              amountCents: p.amountCents,
              dueAt: p.dueAt,
            })),
          );
      await tx
        .update(leads)
        .set({ stageId: stage.id, version: lead.version + 1, updatedAt: now })
        .where(eq(leads.id, lead.id));
      await recordActivity(tx, u, lead.id, 'sale.registered', [], d!.id);
      return { id: d!.id };
    });
  }
  receive(u: AuthUser, id: string, input: { version: number; requestKey: string }) {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`receipt:${input.requestKey}`},0))`,
      );
      const [initial] = await tx.select().from(payments).where(eq(payments.id, id));
      if (!initial) throw new NotFoundException();
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`deal:${initial.dealId}`},0))`,
      );
      const [d] = await tx.select().from(deals).where(eq(deals.id, initial.dealId));
      if (!d) throw new NotFoundException();
      if (d.reversedAt) throw new ConflictException('Venda estornada');
      const [p] = await tx.select().from(payments).where(eq(payments.id, id)).for('update');
      if (!p) throw new NotFoundException();
      if (p.paidAt) {
        if (p.receiptKey === input.requestKey) return { id };
        throw new ConflictException('Parcela já recebida');
      }
      if (p.version !== input.version) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      const [used] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.receiptKey, input.requestKey));
      if (used) throw new ConflictException('Chave já utilizada');
      await tx
        .update(payments)
        .set({
          paidAt: new Date(),
          paidBy: u.id,
          receiptKey: input.requestKey,
          version: p.version + 1,
        })
        .where(eq(payments.id, id));
      await recordActivity(tx, u, d.leadId, 'payment.received', [], id);
      return { id };
    });
  }
  reverse(u: AuthUser, id: string, version: number) {
    return withUser(this.db, u.id, async (tx) => {
      const [initial] = await tx.select().from(deals).where(eq(deals.id, id));
      if (!initial) throw new NotFoundException();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`deal:${id}`},0))`);
      const [lead] = await tx
        .select()
        .from(leads)
        .where(eq(leads.id, initial.leadId))
        .for('update');
      if (!lead) throw new NotFoundException();
      const [d] = await tx.select().from(deals).where(eq(deals.id, id)).for('update');
      if (!d) throw new NotFoundException();
      if (d.reversedAt) return { id };
      if (d.version !== version) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      await tx
        .update(deals)
        .set({ reversedAt: new Date(), reversedBy: u.id, version: d.version + 1 })
        .where(eq(deals.id, id));
      const [current] = await tx
        .select({ key: pipelineStages.key })
        .from(pipelineStages)
        .where(eq(pipelineStages.id, lead.stageId));
      if (current?.key === 'VENDA' && d.previousStageId)
        await tx
          .update(leads)
          .set({ stageId: d.previousStageId, version: lead.version + 1, updatedAt: new Date() })
          .where(eq(leads.id, lead.id));
      await recordActivity(tx, u, d.leadId, 'sale.reversed', [], id);
      return { id };
    });
  }
}
