import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { leadContactTaken, leadTimeline, withUser, type Db } from '@npac/db';
import {
  normalizeInstagram,
  normalizePhoneBR,
  type AuthUser,
  type LeadCreateInput,
  type LeadDTO,
  type Page,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { DB } from '../common/db/db.module.js';
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

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: LeadsRepository,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
  ) {}

  async create(u: AuthUser, input: LeadCreateInput, meta: RequestMeta): Promise<{ id: string }> {
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
      if (u.role === 'HEAD' && !(await this.repo.activeUserFlags(tx, sdrId))?.canProspect) {
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
      const created = await this.repo.insert(tx, {
        name: input.name,
        phoneEnc: input.phone ? this.crypto.encrypt(input.phone) : null,
        phoneBidx: bidx,
        instagram: input.instagram ?? null,
        incomeBand: input.incomeBand,
        source: input.source,
        tier: input.tier,
        stageId,
        sdrId,
        closerId: input.closerId ?? null,
        nextContactAt: input.nextContactAt ?? null,
        summary: input.summary ?? null,
        createdBy: u.id,
      });
      await tx
        .insert(leadTimeline)
        .values({ leadId: created, actorId: u.id, kind: 'lead.created' });
      return created;
    });

    await this.audit.record({
      actorId: u.id,
      action: 'lead.create',
      entityType: 'lead',
      entityId: id,
      ...meta,
    });
    return { id };
  }

  async list(u: AuthUser, q: LeadListQuery, meta: RequestMeta): Promise<Page<LeadDTO>> {
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
    if (u.role === 'HEAD') {
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
      tier: r.tier,
      stageKey: r.stageKey,
      sdr: { id: r.sdrId, name: r.sdrName },
      closer: r.closerId && r.closerName ? { id: r.closerId, name: r.closerName } : null,
      nextContactAt: r.nextContactAt?.toISOString() ?? null,
      summary: r.summary,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
