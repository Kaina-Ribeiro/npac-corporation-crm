import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { deals, leadContactTaken, leads, leadTasks, withUser, type Db, type Tx } from '@npac/db';
import {
  TIER_BY_INCOME_BAND,
  isLeader,
  isLegacyLeadSource,
  type AuthUser,
  type LeadUpdateInput,
} from '@npac/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { recordActivity } from './activity.js';
import { LeadsRepository } from './leads.repository.js';
import type { RequestMeta } from './leads.service.js';

/** Ação rápida do Hoje (pedido do cliente, 04/11/2026). */
export type QuickAction = {
  version: number;
  action: 'CALLED' | 'RESCHEDULED' | 'NEXT_ACTION';
  at?: Date;
  title?: string;
};

/** Venda só entra pelo registro da venda (POST /finance/deals), nunca por cadastro ou PATCH. */
export const saleRequired = () =>
  new ConflictException({
    code: 'SALE_REQUIRED',
    message: 'Para mover para Venda, registre a venda na ficha do lead.',
  });

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
    // Na timeline o texto de "Outro" conta como a própria origem (a lista de campos é fechada).
    const fields = [
      ...new Set(
        Object.keys(input)
          .filter((k) => k !== 'version')
          .map((k) => (k === 'sourceOther' ? 'source' : k)),
      ),
    ];
    return withUser(this.db, u.id, async (tx) => {
      const old = await lockLead(tx, id, input.version);
      const source = input.source ?? old.source;
      if (input.source && input.source !== old.source && isLegacyLeadSource(input.source))
        throw new BadRequestException('Esta origem não é mais usada. Escolha uma da lista.');
      const sourceOther =
        source !== 'OUTRO'
          ? null
          : input.sourceOther !== undefined
            ? input.sourceOther
            : old.sourceOther;
      // Leads antigos em "Outro" ficaram sem texto; só exige ao escolher "Outro" agora.
      if (source === 'OUTRO' && old.source !== 'OUTRO' && !sourceOther)
        throw new BadRequestException('Escreva qual é a origem');
      if (u.role === 'CLOSER' && fields.some((f) => f !== 'stageKey'))
        throw new ForbiddenException();
      if (!isLeader(u.role) && fields.some((f) => f === 'sdrId' || f === 'closerId'))
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
        if (patch.stageId !== old.stageId) await this.guardSaleStage(tx, id, input.stageKey);
      }
      if (input.phone !== undefined) {
        patch.phoneBidx = phoneBidx;
        patch.phoneEnc = input.phone ? this.crypto.encrypt(input.phone) : null;
      }
      if (input.instagram !== undefined) patch.instagram = instagram;
      if (sourceOther !== old.sourceOther) patch.sourceOther = sourceOther ?? null;
      // O perfil acompanha a faixa (gatilho no banco); a timeline registra quando ele muda.
      if (input.incomeBand && TIER_BY_INCOME_BAND[input.incomeBand] !== old.tier) {
        patch.tier = TIER_BY_INCOME_BAND[input.incomeBand];
        fields.push('tier');
      }
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

  /**
   * Chamado: registra e tira o próximo contato. Remarcado: novo próximo contato. Próxima ação:
   * vira tarefa com prazo e o lead sai da lista de contatos. Tudo numa transação, com versão.
   */
  async quickAction(u: AuthUser, id: string, input: QuickAction, meta: RequestMeta) {
    if (input.action !== 'CALLED' && !input.at) throw new BadRequestException('Informe a data');
    if (input.action === 'NEXT_ACTION' && !input.title?.trim())
      throw new BadRequestException('Informe a próxima ação');
    return withUser(this.db, u.id, async (tx) => {
      const old = await lockLead(tx, id, input.version);
      const nextContactAt = input.action === 'RESCHEDULED' ? input.at! : null;
      await tx
        .update(leads)
        .set({ nextContactAt, version: old.version + 1, updatedAt: new Date() })
        .where(eq(leads.id, id));
      if (input.action === 'NEXT_ACTION') {
        const [task] = await tx
          .insert(leadTasks)
          .values({
            leadId: id,
            title: input.title!.trim(),
            dueAt: input.at!,
            // Mesma regra da tarefa da ficha: a liderança delega ao SDR do lead.
            assigneeId: isLeader(u.role) ? old.sdrId : u.id,
            createdBy: u.id,
          })
          .returning({ id: leadTasks.id });
        await recordActivity(tx, u, id, 'task.created', [], task!.id, meta);
      } else {
        await recordActivity(
          tx,
          u,
          id,
          input.action === 'CALLED' ? 'lead.called' : 'lead.contact_rescheduled',
          ['nextContactAt'],
          undefined,
          meta,
        );
      }
      return { id, version: old.version + 1 };
    });
  }

  /**
   * A etapa Venda acompanha a venda registrada: só entra pelo registro (que cria a venda e
   * as parcelas) e só sai pelo estorno. Mover à mão deixaria funil e financeiro divergentes.
   */
  private async guardSaleStage(tx: Tx, id: string, target: string) {
    if (target === 'VENDA') throw saleRequired();
    const [active] = await tx
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.leadId, id), isNull(deals.reversedAt)));
    if (active)
      throw new ConflictException({
        code: 'ACTIVE_SALE',
        message: 'Este lead tem uma venda ativa. Estorne a venda antes de mudar a etapa.',
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
