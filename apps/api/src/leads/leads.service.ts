import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { leadContactTaken, pipelineStages, user, withUser, type Db } from '@npac/db';
import {
  spDayRange,
  TIER_BY_INCOME_BAND,
  normalizeInstagram,
  normalizePhoneBR,
  type AuthUser,
  type LeadCreateInput,
  type LeadDTO,
  type Page,
  isLeader,
} from '@npac/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { toCsv } from '../common/csv.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { DB } from '../common/db/db.module.js';
import { scheduleMeeting } from '../meetings/meetings.service.js';
import { ReminderScheduler } from '../push/reminders.js';
import { recordActivity } from './activity.js';
import { saleRequired } from './lead-mutations.service.js';
import { EMPTY_STAGE_STATE, resolveStageFields } from './stage-fields.js';
import {
  LeadsRepository,
  type LeadFilters,
  type LeadRow,
  type LeadSearch,
} from './leads.repository.js';

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface LeadListQuery extends Omit<LeadFilters, 'search'> {
  search?: string;
  page: number;
  pageSize: number;
}

/** Exportar: filtros da lista + período de criação opcional (dias de Brasília). */
/** `sort`/`direction` vêm da tela e são ignorados: o CSV sai por data de criação. */
export interface LeadExportQuery extends Omit<LeadFilters, 'search'> {
  search?: string;
  createdFrom?: string;
  createdTo?: string;
}

const brDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(d);

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: LeadsRepository,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly reminders: ReminderScheduler,
  ) {}

  async catalog(u: AuthUser) {
    return withUser(this.db, u.id, async (tx) => ({
      stages: await tx.select().from(pipelineStages).orderBy(asc(pipelineStages.position)),
      team: await tx
        .select({
          id: user.id,
          name: user.name,
          role: user.role,
          canProspect: user.canProspect,
          canClose: user.canClose,
        })
        .from(user)
        .where(eq(user.active, true)),
    }));
  }

  async pipeline(u: AuthUser, q: LeadListQuery, meta: RequestMeta) {
    const { stages } = await this.catalog(u);
    return Promise.all(
      stages
        .filter((s) => !q.stage || q.stage === s.key)
        .map(async (stage) => {
          const data = await this.list(u, { ...q, stage: stage.key, page: 1, pageSize: 30 }, meta);
          return {
            stage,
            total: data.total,
            page: 1,
            items: data.items.map(({ id, name, tier, stageKey, version, nextContactAt }) => ({
              id,
              name,
              tier,
              stageKey,
              version,
              nextContactAt,
            })),
          };
        }),
    );
  }

  async create(u: AuthUser, input: LeadCreateInput, meta: RequestMeta): Promise<{ id: string }> {
    if (!isLeader(u.role) && !u.canProspect)
      throw new ForbiddenException('Seu usuário não prospecta. Peça à liderança.');
    if (input.stageKey === 'VENDA') throw saleRequired();
    const sdrId = this.resolveSdr(u, input.sdrId);
    const bidx = input.phone ? this.crypto.blindIndex(input.phone) : null;

    const id = await withUser(this.db, u.id, async (tx) => {
      // Serializa por contato entre todos os SDRs. A ordem evita deadlocks quando
      // telefone e Instagram coincidem em requisições diferentes.
      const contacts = [bidx && `phone:${bidx}`, input.instagram && `instagram:${input.instagram}`]
        .filter((v): v is string => Boolean(v))
        .sort();
      for (const contact of contacts) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${contact}, 0))`);
      }
      if (isLeader(u.role) && !(await this.repo.activeUserFlags(tx, sdrId))?.canProspect) {
        throw new BadRequestException('O responsável precisa ser um SDR ativo que prospecta');
      }
      if (input.closerId && !(await this.repo.activeUserFlags(tx, input.closerId))?.canClose) {
        throw new BadRequestException('O closer precisa ser um usuário ativo que fecha vendas');
      }
      // Enxerga leads de todos os SDRs, mas só responde sim/não: não revela de quem é.
      if (await leadContactTaken(tx, bidx, input.instagram ?? null)) {
        throw new ConflictException({
          code: 'DUPLICATE_LEAD',
          message: 'Já existe um lead com este telefone ou Instagram.',
        });
      }
      const stageId = await this.repo.stageId(tx, input.stageKey);
      if (!stageId) throw new BadRequestException('Etapa inexistente');
      // Dados que a etapa pede (NPAC-38): reunião, pagamento combinado ou motivo.
      const stage = await resolveStageFields(tx, {
        target: input.stageKey,
        changed: true,
        input,
        old: EMPTY_STAGE_STATE,
      });
      const created = await this.repo.insert(tx, {
        name: input.name,
        phoneEnc: input.phone ? this.crypto.encrypt(input.phone) : null,
        phoneBidx: bidx,
        instagram: input.instagram ?? null,
        incomeBand: input.incomeBand,
        source: input.source,
        sourceOther: input.source === 'OUTRO' ? (input.sourceOther ?? null) : null,
        // O gatilho do banco garante o mesmo perfil; aqui só preenche a coluna obrigatória.
        tier: TIER_BY_INCOME_BAND[input.incomeBand],
        stageId,
        sdrId,
        closerId: input.closerId ?? null,
        ...stage.values,
        summary: input.summary ?? null,
        createdBy: u.id,
      });
      await recordActivity(tx, u, created, 'lead.created', [], undefined, meta);
      // Mesma transação: se a reunião falhar, o lead não fica criado.
      if (stage.meeting) await scheduleMeeting(tx, u, { leadId: created, ...stage.meeting });
      return { id: created, scheduled: Boolean(stage.meeting) };
    });

    // Depois do commit, como no POST /meetings.
    if (id.scheduled) void this.reminders.rearm();
    return { id: id.id };
  }

  async list(u: AuthUser, q: LeadListQuery, meta: RequestMeta): Promise<Page<LeadDTO>> {
    if (q.period === 'RANGE' && (!q.from || !q.to || q.from > q.to))
      throw new BadRequestException('Intervalo inválido');
    const { search, page, pageSize, ...filters } = q;
    const { rows, total } = await withUser(this.db, u.id, (tx) =>
      this.repo.list(tx, { ...filters, search: this.parseSearch(search) }, page, pageSize),
    );
    await this.audit.record({
      actorId: u.id,
      action: 'lead.list',
      entityType: 'lead',
      data: { ids: rows.map((r) => r.id), page, pageSize },
      ...meta,
    });
    return { items: rows.map((r) => this.toDTO(r)), total, page, pageSize };
  }

  /** CSV com contato (só liderança, pela rota): período, filtros atuais ou todos. */
  async csv(u: AuthUser, q: LeadExportQuery, meta: RequestMeta): Promise<string> {
    const { search, createdFrom, createdTo, ...filters } = q;
    if (!createdFrom !== !createdTo || (createdFrom && createdTo && createdFrom > createdTo))
      throw new BadRequestException('Intervalo inválido');
    const created =
      createdFrom && createdTo
        ? {
            start: spDayRange(new Date(`${createdFrom}T12:00:00Z`)).start,
            end: spDayRange(new Date(`${createdTo}T12:00:00Z`)).end,
          }
        : undefined;
    const rows = await withUser(this.db, u.id, (tx) =>
      this.repo.exportRows(tx, { ...filters, search: this.parseSearch(search) }, created),
    );
    if (rows.length > 10_000)
      throw new BadRequestException('Reduza o filtro para exportar até 10 mil leads');
    await this.audit.record({
      actorId: u.id,
      action: 'lead.export.csv',
      entityType: 'lead',
      data: { count: rows.length },
      ...meta,
    });
    return toCsv([
      ['Nome', 'Telefone', 'Instagram', 'Perfil', 'Etapa', 'SDR', 'Criado em'],
      ...rows.map((r) => [
        r.name,
        r.phoneEnc ? this.crypto.decrypt(r.phoneEnc) : '',
        r.instagram ?? '',
        r.tier,
        r.stage,
        r.sdrName,
        brDate(r.createdAt),
      ]),
    ]);
  }

  async get(u: AuthUser, id: string, meta: RequestMeta): Promise<LeadDTO> {
    const row = await withUser(this.db, u.id, (tx) => this.repo.findById(tx, id));
    // Invisível e inexistente respondem igual: não revela que o lead existe.
    if (!row) throw new NotFoundException();
    await this.audit.record({
      actorId: u.id,
      action: 'lead.view',
      entityType: 'lead',
      entityId: id,
      ...meta,
    });
    return this.toDTO(row);
  }

  private resolveSdr(u: AuthUser, requested: string | undefined): string {
    if (isLeader(u.role)) {
      if (!requested) throw new BadRequestException('Escolha o SDR responsável');
      return requested;
    }
    if (requested && requested !== u.id) {
      throw new ForbiddenException('SDR só cadastra leads em nome próprio');
    }
    return u.id;
  }

  private parseSearch(raw: string | undefined): LeadSearch | undefined {
    const term = raw?.trim();
    if (!term) return undefined;
    const phone = normalizePhoneBR(term);
    if (phone) return { kind: 'phone', bidx: this.crypto.blindIndex(phone) };
    const handle = normalizeInstagram(term);
    if (handle && (term.startsWith('@') || term.includes('instagram.com'))) {
      return { kind: 'instagram', handle };
    }
    return { kind: 'text', term, handle };
  }

  private toDTO(r: LeadRow): LeadDTO {
    return {
      id: r.id,
      name: r.name,
      phone: r.phoneEnc ? this.crypto.decrypt(r.phoneEnc) : null,
      instagram: r.instagram,
      incomeBand: r.incomeBand,
      source: r.source,
      sourceOther: r.sourceOther,
      tier: r.tier,
      stageKey: r.stageKey,
      sdr: { id: r.sdrId, name: r.sdrName },
      closer: r.closerId && r.closerName ? { id: r.closerId, name: r.closerName } : null,
      nextContactAt: r.nextContactAt?.toISOString() ?? null,
      summary: r.summary,
      paymentProductId: r.paymentProductId,
      paymentAmountCents: r.paymentAmountCents,
      lostReason: r.lostReason,
      lostReasonOther: r.lostReasonOther,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
