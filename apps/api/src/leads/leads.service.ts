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
  pipelineStages,
  products,
  user,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  spDayRange,
  TIER_BY_INCOME_BAND,
  TIER_LABELS,
  normalizeEmail,
  normalizeInstagram,
  normalizePhoneBR,
  type AuthUser,
  type LeadCreateInput,
  type LeadDTO,
  type Page,
  isLeader,
  can,
} from '@npac/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { toCsv } from '../common/csv.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { DB } from '../common/db/db.module.js';
import { insertSale, requestHash } from '../finance/finance.service.js';
import { scheduleMeeting } from '../meetings/meetings.service.js';
import { ReminderScheduler } from '../push/reminders.js';
import { recordActivity } from './activity.js';
import { assertIncomeStage, EMPTY_STAGE_STATE, resolveStageFields } from './stage-fields.js';
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

/** Dia de Brasília (AAAA-MM-DD). */
const spDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

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
            items: data.items.map(
              ({
                id,
                name,
                tier,
                stageKey,
                version,
                nextContactAt,
                saleToRegister,
                paymentToComplete,
              }) => ({
                id,
                name,
                tier,
                stageKey,
                version,
                nextContactAt,
                saleToRegister,
                paymentToComplete,
              }),
            ),
          };
        }),
    );
  }

  async create(u: AuthUser, input: LeadCreateInput, meta: RequestMeta): Promise<{ id: string }> {
    const sold = this.checkSoldLead(u, input);
    const sdrId = this.resolveSdr(u, input.sdrId);
    const bidx = input.phone ? this.crypto.blindIndex(input.phone) : null;
    const emailBidx = input.email ? this.crypto.blindIndex(input.email) : null;
    const hash = input.sale ? requestHash(input) : '';

    const id = await withUser(this.db, u.id, async (tx) => {
      // Venda no cadastro: repetir o mesmo pedido devolve o mesmo lead (requestKey + hash).
      if (input.sale) {
        const key = input.sale.requestKey;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sale:${key}`},0))`);
        const [retry] = await tx
          .select({ leadId: deals.leadId, requestHash: deals.requestHash })
          .from(deals)
          .where(eq(deals.requestKey, key));
        if (retry) {
          if (retry.requestHash !== hash)
            throw new ConflictException('Chave já usada em outra requisição');
          return { id: retry.leadId, scheduled: false };
        }
      }
      // Serializa por contato entre todos os SDRs. A ordem evita deadlocks quando
      // os contatos coincidem em requisições diferentes.
      const contacts = [
        bidx && `phone:${bidx}`,
        input.instagram && `instagram:${input.instagram}`,
        emailBidx && `email:${emailBidx}`,
      ]
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
      if (await leadContactTaken(tx, bidx, input.instagram ?? null, emailBidx)) {
        throw new ConflictException({
          code: 'DUPLICATE_LEAD',
          message: 'Já existe um lead com este telefone, Instagram ou e-mail.',
        });
      }
      const stageId = await this.repo.stageId(tx, input.stageKey);
      if (!stageId) throw new BadRequestException('Etapa inexistente');
      assertIncomeStage(input.incomeBand, input.stageKey);
      // Dados que a etapa pede (NPAC-38): reunião, pagamento combinado ou motivo.
      const stage = await resolveStageFields(tx, {
        target: input.stageKey,
        changed: true,
        input,
        old: EMPTY_STAGE_STATE,
        role: u.role,
      });
      const created = await this.repo.insert(tx, {
        name: input.name,
        phoneEnc: input.phone ? this.crypto.encrypt(input.phone) : null,
        phoneBidx: bidx,
        instagram: input.instagram ?? null,
        emailEnc: input.email ? this.crypto.encrypt(input.email) : null,
        emailBidx,
        incomeBand: input.incomeBand,
        source: input.source,
        sourceOther: input.source === 'OUTRO' ? (input.sourceOther ?? null) : null,
        // O gatilho do banco garante o mesmo perfil; aqui só preenche a coluna obrigatória.
        tier: TIER_BY_INCOME_BAND[input.incomeBand],
        stageId,
        sdrId,
        // Venda Fechada: o closer da reunião passa a ser o do lead.
        closerId: stage.closerId ?? input.closerId ?? sold?.closerId ?? null,
        ...stage.values,
        soldProductId: sold && !input.sale ? (input.soldProductId ?? null) : null,
        summary: input.summary ?? null,
        createdBy: u.id,
      });
      await recordActivity(tx, u, created, 'lead.created', [], undefined, meta);
      if (stage.notifyCloser)
        await recordActivity(tx, u, created, 'payment.pending', [], undefined, meta);
      // Mesma transação: se a reunião falhar, o lead não fica criado.
      if (stage.meeting) await scheduleMeeting(tx, u, { leadId: created, ...stage.meeting });
      if (sold) await this.registerSold(tx, u, { id: created, sdrId, stageId }, sold, input, hash);
      return { id: created, scheduled: Boolean(stage.meeting || sold) };
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
    return { items: rows.map((r) => this.toDTO(r, u)), total, page, pageSize };
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
      ['Nome', 'Telefone', 'Instagram', 'E-mail', 'Perfil', 'Etapa', 'SDR', 'Criado em'],
      ...rows.map((r) => [
        r.name,
        r.phoneEnc ? this.crypto.decrypt(r.phoneEnc) : '',
        r.instagram ?? '',
        r.emailEnc ? this.crypto.decrypt(r.emailEnc) : '',
        TIER_LABELS[r.tier],
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
    return this.toDTO(row, u);
  }

  /**
   * Venda Fechada no cadastro (NPAC-39): a reunião é obrigatória e já aconteceu; a venda, só para
   * quem registra venda, e só nesta etapa. Devolve a reunião, ou nada fora da Venda.
   */
  private checkSoldLead(u: AuthUser, input: LeadCreateInput) {
    if (input.sale && !can(u, 'sale:register'))
      throw new ForbiddenException('Só o closer e a liderança registram a venda.');
    if (input.stageKey !== 'VENDA') {
      if (input.sale) throw new BadRequestException('A venda só vai junto da etapa Venda');
      return undefined;
    }
    if (!input.meeting)
      throw new ConflictException({
        code: 'MEETING_REQUIRED',
        message: 'Para cadastrar em Venda Fechada, informe a data, a hora e o closer da reunião.',
      });
    if (input.meeting.scheduledAt.getTime() > Date.now())
      throw new BadRequestException('A reunião ainda não aconteceu');
    // Sem a venda agora, o produto vendido é obrigatório (NPAC-41); com ela, vale o da venda.
    if (!input.sale && !input.soldProductId)
      throw new ConflictException({
        code: 'PRODUCT_REQUIRED',
        message: 'Para cadastrar em Venda Fechada, escolha o produto vendido.',
      });
    return input.meeting;
  }

  /**
   * Reunião realizada (o SDR recebe por ela no dia da reunião) e, se veio, a venda com o dia
   * informado. Sem a venda, o lead fica "a registrar" e o closer da reunião é avisado.
   */
  private async registerSold(
    tx: Tx,
    u: AuthUser,
    lead: { id: string; sdrId: string; stageId: string },
    meeting: { scheduledAt: Date; closerId: string },
    input: LeadCreateInput,
    hash: string,
  ) {
    const m = await scheduleMeeting(tx, u, {
      leadId: lead.id,
      closerId: meeting.closerId,
      scheduledAt: meeting.scheduledAt,
      origin: 'DIRETO',
      outcome: 'DONE',
      outcomeAt: meeting.scheduledAt,
    });
    await recordActivity(tx, u, lead.id, 'meeting.outcome', ['outcome'], m.id);
    if (!input.sale) {
      // Produto vendido: ativo e do closer da reunião (o closer da venda).
      const [p] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.id, input.soldProductId!),
            eq(products.closerId, meeting.closerId),
            eq(products.active, true),
          ),
        );
      if (!p) throw new BadRequestException('Produto inválido para o closer da reunião');
      await recordActivity(tx, u, lead.id, 'sale.pending', [], m.id);
      return;
    }
    const { closedOn, ...sale } = input.sale;
    const today = spDay(new Date());
    if (closedOn > today) throw new BadRequestException('A data da venda não pode ser futura');
    // Hoje: o instante do registro. Antes: meio-dia de Brasília do dia informado.
    const closedAt = closedOn === today ? new Date() : new Date(`${closedOn}T12:00:00-03:00`);
    const d = await insertSale(
      tx,
      u,
      lead,
      { ...sale, closerId: meeting.closerId },
      hash,
      closedAt,
    );
    await recordActivity(tx, u, lead.id, 'sale.registered', [], d.id);
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
    // "@" no meio é e-mail; "@usuario" e link do Instagram (com "/") seguem abaixo.
    if (/^[^\s@/]+@[^\s@/]+$/.test(term))
      return { kind: 'email', bidx: this.crypto.blindIndex(normalizeEmail(term)) };
    const phone = normalizePhoneBR(term);
    if (phone) return { kind: 'phone', bidx: this.crypto.blindIndex(phone) };
    const handle = normalizeInstagram(term);
    if (handle && (term.startsWith('@') || term.includes('instagram.com'))) {
      return { kind: 'instagram', handle };
    }
    return { kind: 'text', term, handle };
  }

  private toDTO(r: LeadRow, u: AuthUser): LeadDTO {
    // SDR não vê R$ de venda (item 13): corte aqui, não na tela.
    const sees = u.role !== 'SDR';
    return {
      id: r.id,
      name: r.name,
      phone: r.phoneEnc ? this.crypto.decrypt(r.phoneEnc) : null,
      instagram: r.instagram,
      email: r.emailEnc ? this.crypto.decrypt(r.emailEnc) : null,
      incomeBand: r.incomeBand,
      source: r.source,
      sourceOther: r.sourceOther,
      tier: r.tier,
      stageKey: r.stageKey,
      sdr: { id: r.sdrId, name: r.sdrName },
      closer: r.closerId && r.closerName ? { id: r.closerId, name: r.closerName } : null,
      // Em Agendou Pagamento a data é a combinada com o closer, não um contato do SDR.
      nextContactAt:
        sees || r.stageKey !== 'AGENDOU_PAGAMENTO'
          ? (r.nextContactAt?.toISOString() ?? null)
          : null,
      summary: r.summary,
      paymentProductId: r.paymentProductId,
      paymentAmountCents: sees ? r.paymentAmountCents : null,
      paymentEntryCents: sees ? r.paymentEntryCents : null,
      paymentEntryPaid: r.paymentEntryPaid,
      // Sem produto é lead antigo na etapa (NPAC-38, 3A): não há o que completar.
      paymentToComplete:
        r.stageKey === 'AGENDOU_PAGAMENTO' &&
        r.paymentProductId !== null &&
        r.paymentAmountCents === null,
      lostReason: r.lostReason,
      lostReasonOther: r.lostReasonOther,
      saleToRegister: r.saleToRegister,
      // Só vale enquanto a venda não é registrada (a API apaga ao registrar).
      soldProductId: r.saleToRegister ? r.soldProductId : null,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
