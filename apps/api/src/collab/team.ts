import { Controller, Get, Inject, Injectable } from '@nestjs/common';
import { isLeader } from '@npac/shared';
import { withUser, type Db } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { ReportsService } from '../finance/reports.service.js';

type Row = Record<string, unknown> & { id: string };
export type TeamStats = {
  leads: number;
  meetings: number;
  done: number;
  sales: number;
  soldCents: number;
};

/** Cards da equipe: HEAD vê os números de todos; os demais, só os próprios. */
@Injectable()
export class TeamService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reports: ReportsService,
  ) {}

  async members(u: AuthUser) {
    const users = await withUser(this.db, u.id, async (tx) => [
      ...(await tx.execute<{
        id: string;
        name: string;
        role: string;
        can_prospect: boolean;
        can_close: boolean;
      }>(
        sql`select id, name, role, can_prospect, can_close from "user" where active order by role, name`,
      )),
    ]);
    const r = await this.reports.search(u, { period: 'MONTH', pageSize: 1 }, { audit: false });
    const bySdr = new Map((r.bySdr as Row[]).map((x) => [x.id, x]));
    const byCloser = new Map((r.byCloser as Row[]).map((x) => [x.id, x]));
    const stats = (id: string): TeamStats | null => {
      if (!isLeader(u.role) && id !== u.id) return null;
      const s = bySdr.get(id);
      const c = byCloser.get(id);
      const n = (v: unknown) => Number(v ?? 0);
      return {
        leads: n(s?.leads),
        meetings: n(s?.meetings) + n(c?.meetings),
        done: n(s?.done) + n(c?.done),
        sales: Math.max(n(s?.sales), n(c?.sales)),
        soldCents: Math.max(n(s?.soldCents), n(c?.soldCents)),
      };
    };
    return {
      from: r.from,
      to: r.to,
      members: users.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        canProspect: m.can_prospect,
        canClose: m.can_close,
        stats: stats(m.id),
      })),
    };
  }
}

@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}
  @Get() get(@CurrentUser() u: SessionUser) {
    return this.team.members(u);
  }
}
