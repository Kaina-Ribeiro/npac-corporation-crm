import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { deals, leadContactTaken, leads, withUser, type Db, type Tx } from '@npac/db';
import type { AuthUser, LeadUpdateInput } from '@npac/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { recordActivity } from './activity.js';
import { LeadsRepository } from './leads.repository.js';
import type { RequestMeta } from './leads.service.js';

/** Bloqueio de linha + versão: uma edição antiga não sobrescreve a versão atual. */
export async function lockLead(tx: Tx, id: string, version?: number) {
  const [row] = await tx.select().from(leads).where(eq(leads.id, id)).for('update');
  if (!row || row.deletedAt) throw new NotFoundException();
  if (version !== undefined && row.version !== version)
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'O lead mudou. Atualize e tente novamente.',
    });
  return row;
}

@Injectable()
export class LeadMutationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: FieldCrypto,
    private readonly repo: LeadsRepository,
  ) {}

  async update(u: AuthUser, id: string, input: LeadUpdateInput, meta: RequestMeta) {
    const fields = Object.keys(input).filter((k) => k !== 'version');
    return withUser(this.db, u.id, async (tx) => {
      const old = await lockLead(tx, id, input.version);
      if (u.role === 'CLOSER' && fields.some((f) => f !== 'stageKey'))
        throw new ForbiddenException();
      if (u.role !== 'HEAD' && fields.some((f) => f === 'sdrId' || f === 'closerId'))
        throw new ForbiddenException();
      if (input.sdrId && !(await this.repo.activeUserFlags(tx, input.sdrId))?.canProspect)
        throw new BadRequestException('SDR inválido');
      if (input.closerId && !(await this.repo.activeUserFlags(tx, input.closerId))?.canClose)
        throw new BadRequestException('Closer inválido');
      const phoneBidx =
        input.phone === undefined
          ? old.phoneBidx
          : input.phone
            ? this.crypto.blindIndex(input.phone)
            : null;
      const instagram = input.instagram === undefined ? old.instagram : input.instagram;
      if (!phoneBidx && !instagram) throw new BadRequestException('Informe telefone ou Instagram');
      for (const key of [phoneBidx && `phone:${phoneBidx}`, instagram && `instagram:${instagram}`]
        .filter((v): v is string => Boolean(v))
        .sort()) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      }
      if (await leadContactTaken(tx, phoneBidx, instagram, id))
        throw new ConflictException({ code: 'DUPLICATE_LEAD', message: 'Contato já cadastrado.' });
      const patch: Partial<typeof leads.$inferInsert> = {
        version: old.version + 1,
        updatedAt: new Date(),
      };
      for (const key of [
        'name',
        'incomeBand',
        'source',
        'tier',
        'sdrId',
        'closerId',
        'nextContactAt',
        'summary',
      ] as const) {
        if (input[key] !== undefined) Object.assign(patch, { [key]: input[key] });
      }
      if (input.stageKey) {
        patch.stageId = await this.repo.stageId(tx, input.stageKey);
        if (!patch.stageId) throw new BadRequestException('Etapa inexistente');
      }
      if (input.phone !== undefined) {
        patch.phoneBidx = phoneBidx;
        patch.phoneEnc = input.phone ? this.crypto.encrypt(input.phone) : null;
      }
      if (input.instagram !== undefined) patch.instagram = instagram;
      await tx.update(leads).set(patch).where(eq(leads.id, id));
      const kind =
        fields.includes('sdrId') || fields.includes('closerId')
          ? 'lead.reassigned'
          : fields.length === 1 && fields[0] === 'stageKey'
            ? 'lead.moved'
            : 'lead.updated';
      await recordActivity(tx, u, id, kind, fields, undefined, meta);
      return { id, version: old.version + 1 };
    });
  }

  async remove(u: AuthUser, id: string, version: number, meta: RequestMeta) {
    return withUser(this.db, u.id, async (tx) => {
      const old = await lockLead(tx, id, version);
      const [active] = await tx
        .select({ id: deals.id })
        .from(deals)
        .where(and(eq(deals.leadId, id), isNull(deals.reversedAt)));
      if (active)
        throw new ConflictException({
          code: 'ACTIVE_SALE',
          message: 'Estorne a venda ativa antes de excluir o lead.',
        });
      await recordActivity(tx, u, id, 'lead.deleted', [], undefined, meta);
      await tx
        .update(leads)
        .set({ deletedAt: new Date(), updatedAt: new Date(), version: old.version + 1 })
        .where(eq(leads.id, id));
      return { id, version: old.version + 1 };
    });
  }
}
