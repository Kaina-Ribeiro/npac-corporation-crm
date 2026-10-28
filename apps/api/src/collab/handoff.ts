import { Controller, Get, Inject, Injectable, NotFoundException, Param } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import { INCOME_BAND_LABELS, type AuthUser, type IncomeBand } from '@npac/shared';
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

/** Handoff para o closer e link do Google Agenda: nunca levam telefone ou Instagram. */
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
        tier: string;
        income_band: IncomeBand;
        summary: string | null;
        sdr: string;
        scheduled_at: Date | null;
        closer: string | null;
      }>(sql`
        select l.name, l.tier, l.income_band, l.summary, s.name as sdr, m.scheduled_at, c.name as closer
        from leads l join "user" s on s.id = l.sdr_id
        left join lateral (select scheduled_at, closer_id from meetings
          where lead_id = l.id and canceled_at is null and outcome is null and scheduled_at > now()
          order by scheduled_at limit 1) m on true
        left join "user" c on c.id = m.closer_id
        where l.id = ${leadId} and l.deleted_at is null`);
      return rows[0];
    });
    if (!row) throw new NotFoundException();
    const at = row.scheduled_at ? new Date(row.scheduled_at) : null;
    const text = [
      'Handoff NPAC',
      `Lead: ${row.name}`,
      `Perfil: ${row.tier} · Renda ${INCOME_BAND_LABELS[row.income_band]}`,
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
      url.searchParams.set('text', `Reunião NPAC (${row.tier})`);
      url.searchParams.set('dates', `${gcal(at)}/${gcal(new Date(at.getTime() + 59 * 60_000))}`);
      url.searchParams.set('details', `Ficha no CRM: ${this.env.WEB_ORIGIN}/leads/${leadId}`);
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
