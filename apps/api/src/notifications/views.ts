import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { savedViews, withUser, type Db } from '@npac/db';
import { LEAD_SOURCES, STAGE_KEYS, TIERS, type AuthUser } from '@npac/shared';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { validate } from '../common/validate.js';

/** Mesmos critérios da lista de leads, sem busca livre: nada de contato fica salvo. */
const viewInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    filters: z
      .object({
        stage: z.enum(STAGE_KEYS).optional(),
        tier: z.enum(TIERS).optional(),
        source: z.enum(LEAD_SOURCES).optional(),
        sdrId: z.string().max(64).optional(),
        closerId: z.string().max(64).optional(),
        period: z.enum(['TODAY', 'TOMORROW', 'WEEK', 'OVERDUE', 'NO_DATE', 'RANGE']).optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        sort: z.enum(['createdAt', 'name', 'nextContactAt', 'meetingAt']).optional(),
        direction: z.enum(['asc', 'desc']).optional(),
      })
      .strict(),
  })
  .strict();

@Injectable()
export class ViewsService {
  constructor(@Inject(DB) private readonly db: Db) {}
  list(u: AuthUser) {
    return withUser(this.db, u.id, (tx) =>
      tx
        .select({ id: savedViews.id, name: savedViews.name, filters: savedViews.filters })
        .from(savedViews)
        .orderBy(asc(savedViews.createdAt)),
    );
  }
  create(u: AuthUser, input: z.output<typeof viewInput>) {
    return withUser(this.db, u.id, async (tx) => {
      const [row] = await tx
        .insert(savedViews)
        .values({
          userId: u.id,
          name: input.name,
          filters: input.filters as Record<string, string>,
        })
        .returning({ id: savedViews.id });
      return row!;
    });
  }
  remove(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      const rows = await tx
        .delete(savedViews)
        .where(eq(savedViews.id, id))
        .returning({ id: savedViews.id });
      if (!rows.length) throw new NotFoundException();
      return { id };
    });
  }
}

@Controller('views')
export class ViewsController {
  constructor(private readonly views: ViewsService) {}
  @Get() list(@CurrentUser() u: SessionUser) {
    return this.views.list(u);
  }
  @Post() @HttpCode(201) create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.views.create(u, validate(viewInput, body));
  }
  @Delete(':id') remove(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException();
    return this.views.remove(u, id);
  }
}
