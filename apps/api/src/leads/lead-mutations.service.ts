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
  leadContactTaken,
  leads,
  leadTasks,
  pipelineStages,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
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
import { scheduleMeeting } from '../meetings/meetings.service.js';
import { ReminderScheduler } from '../push/reminders.js';
import { recordActivity } from './activity.js';
import { LeadsRepository } from './leads.repository.js';
import type { RequestMeta } from './leads.service.js';
import {
  resolveStageFields,
  STAGE_DATA_FIELDS,
  timelineField,
  type StageState,
} from './stage-fields.js';

/** Campos da timeline que acompanham a troca de etapa: com eles a mudança ainda é "moveu". */
const MOVE_FIELDS = new Set(['stageKey', 'nextContactAt', 'payment', 'lostReason']);
const sameValue = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

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
    private readonly reminders: ReminderScheduler,
  ) {}

  async update(u: AuthUser, id: string, input: LeadUpdateInput, meta: RequestMeta) {
    const keys = Object.keys(input).filter((k) => k !== 'version');
    // Na timeline o texto de "Outro" conta como a própria origem (a lista de campos é fechada);
    // pagamento e motivo entram pelo nome do grupo; a reunião tem o próprio registro.
    const fields = [
      ...new Set(
        keys
          .filter((k) => k !== 'meeting')
          .map((k) => (k === 'sourceOther' ? 'source' : timelineField(k))),
      ),
    ];
    const result = await withUser(this.db, u.id, async (tx) => {
      const old = await lockLead(tx, id, input.version);
      const [current] = await tx
        .select({ key: pipelineStages.key })
        .from(pipelineStages)
        .where(eq(pipelineStages.id, old.stageId));
      let target = current!.key;
      let stageId = old.stageId;
      if (input.stageKey) {
        const found = await this.repo.stageId(tx, input.stageKey);
        if (!found) throw new BadRequestException('Etapa inexistente');
        stageId = found;
        target = input.stageKey;
      }
      const stageChanged = stageId !== old.stageId;
      // Closer move a etapa e, junto com a troca, grava os dados dela (pagamento, motivo, data).
      // Reunião nova ele não agenda (RLS e permissão `meeting:schedule`).
      if (
        u.role === 'CLOSER' &&
        keys.some(
          (k) =>
            k !== 'stageKey' &&
            !(stageChanged && (STAGE_DATA_FIELDS as readonly string[]).includes(k)),
        )
      )
        throw new ForbiddenException();
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
      for (const key of ['name', 'incomeBand', 'source', 'sdrId', 'closerId', 'summary'] as const) {
        if (input[key] !== undefined) Object.assign(patch, { [key]: input[key] });
      }
      if (input.stageKey) {
        patch.stageId = stageId;
        if (stageChanged) await this.guardSaleStage(tx, id, input.stageKey);
        // Saiu da Venda sem a venda registrada: o produto informado no cadastro deixa de valer.
        if (stageChanged && old.soldProductId) patch.soldProductId = null;
      }
      // Dados da etapa (NPAC-38): exigidos só na troca; fora da etapa são apagados.
      const stage = await resolveStageFields(tx, {
        leadId: id,
        target,
        changed: stageChanged,
        input,
        old: old as StageState,
      });
      for (const [key, value] of Object.entries(stage.values) as [keyof StageState, unknown][]) {
        if (sameValue(value, old[key])) continue;
        Object.assign(patch, { [key]: value });
        if (!fields.includes(timelineField(key))) fields.push(timelineField(key));
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
          : fields.includes('stageKey') && fields.every((f) => MOVE_FIELDS.has(f))
            ? 'lead.moved'
            : 'lead.updated';
      await recordActivity(tx, u, id, kind, fields, undefined, meta);
      // Mesma transação: se a reunião falhar, a etapa não muda.
      if (stage.meeting) await scheduleMeeting(tx, u, { leadId: id, ...stage.meeting });
      return { id, version: old.version + 1, scheduled: Boolean(stage.meeting) };
    });
    // Depois do commit, como no POST /meetings.
    if (result.scheduled) void this.reminders.rearm();
    return { id: result.id, version: result.version };
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
