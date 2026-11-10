import { Controller, Get, Inject, Injectable, NotFoundException, Param } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import {
  INCOME_BAND_LABELS,
  TIER_LABELS,
  type AuthUser,
  type IncomeBand,
  type Tier,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { entityId } from '../common/validate.js';
import { ENV, type Env } from '../config/env.js';

const brt = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
    .format(d)
    .replace(',', '');
const gcal = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Sigla de quem agenda no título da agenda: 2 primeiras letras do nome (Igor → IG). */
export const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

/**
 * Handoff para o closer e link do Google Agenda: nunca levam telefone ou Instagram. Por pedido do
 * cliente (04/11/2026) a agenda leva nome do lead, perfil, sigla e o texto do handoff.
 */
@Injectable()
export class HandoffService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  async build(u: AuthUser, leadId: string) {
    const row = await withUser(this.db, u.id, async (tx) => {
      const rows = await tx.execute<{
        name: string;
        tier: Tier;
        income_band: IncomeBand;
        summary: string | null;
        sdr: string;
        scheduled_at: Date | null;
        closer: string | null;
        scheduler: string | null;
      }>(sql`
        select l.name, l.tier, l.income_band, l.summary, s.name as sdr, m.scheduled_at, c.name as closer,
          a.name as scheduler
        from leads l join "user" s on s.id = l.sdr_id
        left join lateral (select scheduled_at, closer_id, created_by from meetings
          where lead_id = l.id and canceled_at is null and outcome is null
          order by (scheduled_at > now()) desc, abs(extract(epoch from scheduled_at - now())) limit 1) m on true
        left join "user" c on c.id = m.closer_id
        left join "user" a on a.id = m.created_by
        where l.id = ${leadId} and l.deleted_at is null`);
      return rows[0];
    });
    if (!row) throw new NotFoundException();
    const at = row.scheduled_at ? new Date(row.scheduled_at) : null;
    const text = [
      'Handoff NPAC',
      `Lead: ${row.name}`,
      `Perfil: ${TIER_LABELS[row.tier]} · Renda ${INCOME_BAND_LABELS[row.income_band]}`,
      `SDR: ${row.sdr}`,
      at ? `Reunião: ${brt(at)} com ${row.closer}` : 'Reunião: a agendar',
      row.summary ? `Resumo: ${row.summary}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    let calendarUrl: string | null = null;
    if (at) {
      const url = new URL('https://calendar.google.com/calendar/render');
      url.searchParams.set('action', 'TEMPLATE');
      url.searchParams.set(
        'text',
        `Reunião ${row.name} (${TIER_LABELS[row.tier]}) ${initials(row.scheduler ?? row.sdr)}`.trim(),
      );
      url.searchParams.set('dates', `${gcal(at)}/${gcal(new Date(at.getTime() + 59 * 60_000))}`);
      url.searchParams.set(
        'details',
        `${text}

Ficha no CRM: ${this.env.WEB_ORIGIN}/leads/${leadId}`,
      );
      calendarUrl = url.toString();
    }
    await this.audit.record({
      actorId: u.id,
      action: 'lead.handoff',
      entityType: 'lead',
      entityId: leadId,
    });
    return { text, calendarUrl };
  }
}

@Controller('leads')
export class HandoffController {
  constructor(private readonly handoff: HandoffService) {}
  @Get(':id/handoff') get(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.handoff.build(u, entityId(id));
  }
}
