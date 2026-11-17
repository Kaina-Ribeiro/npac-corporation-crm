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
  /** Ausente para SDR. */
  soldCents?: number;
};

/** Cards da equipe: HEAD vê os números de todos; os demais, só os próprios. */
@Injectable()
export class TeamService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reports: ReportsService,
  ) {}

  async members(u: AuthUser) {
    // Uma transação: usuários, linhas por SDR/closer do mês (mesmas consultas do relatório, sem o
    // resto dele) e vendas por pessoa.
    const { users, r, sales } = await withUser(
      this.db,
      u.id,
      async (tx) => {
        const users = await tx.execute<{
          id: string;
          name: string;
          role: string;
          can_prospect: boolean;
          can_close: boolean;
        }>(
          sql`select id, name, role, can_prospect, can_close from "user" where active order by role, name`,
        );
        const r = await this.reports.peopleOfMonth(tx);
        // Vendas por pessoa: cada venda conta uma vez para quem prospectou e uma para quem fechou
        // (a mesma pessoa nos dois papéis conta uma só), com o mesmo recorte do relatório.
        const sales = await tx.execute<{ id: string; sales: string; cents: string }>(sql`
          select t.id, count(*) as sales, coalesce(sum(t.total_cents), 0) as cents
          from (select distinct x.id, d.id as deal_id, d.total_cents
            from deals d
            join leads l on l.id = d.lead_id and l.deleted_at is null
            cross join lateral (values (d.sdr_id), (d.closer_id)) x(id)
            where d.reversed_at is null and d.closed_at >= ${r.from} and d.closed_at < ${r.to}) t
          group by t.id`);
        return { users: [...users], r, sales: new Map(sales.map((x) => [x.id, x])) };
      },
      { isolationLevel: 'repeatable read' },
    );
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
        sales: n(sales.get(id)?.sales),
        // SDR não vê faturamento (pedido do cliente, 04/11/2026): o corte é no servidor.
        ...(u.role === 'SDR' ? {} : { soldCents: n(sales.get(id)?.cents) }),
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
