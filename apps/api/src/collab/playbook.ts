import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { playbookScripts, withUser, type Db, type Tx } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { Can } from '../auth/can.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { entityId, validate } from '../common/validate.js';

const fields = {
  topic: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
};
const create = z.object(fields).strict();
const update = z
  .object({ version: z.number().int().positive(), ...fields })
  .partial({ topic: true, title: true, body: true })
  .strict();
const version = z.object({ version: z.number().int().positive() }).strict();

function duplicate(error: unknown): never {
  const e = error as { code?: string; cause?: { code?: string } };
  if ((e.cause?.code ?? e.code) === '23505')
    throw new ConflictException('Já existe um script com este título no tema');
  throw error;
}

@Injectable()
export class PlaybookService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  list(u: AuthUser) {
    return withUser(this.db, u.id, (tx) =>
      tx
        .select({
          id: playbookScripts.id,
          topic: playbookScripts.topic,
          title: playbookScripts.title,
          body: playbookScripts.body,
          version: playbookScripts.version,
        })
        .from(playbookScripts)
        .orderBy(
          asc(playbookScripts.topic),
          asc(playbookScripts.position),
          asc(playbookScripts.title),
        ),
    );
  }

  async create(u: AuthUser, input: z.output<typeof create>) {
    const [row] = await withUser(this.db, u.id, (tx) =>
      tx
        .insert(playbookScripts)
        .values({ ...input, updatedBy: u.id })
        .returning({ id: playbookScripts.id }),
    ).catch(duplicate);
    await this.record(u, 'playbook.create', row!.id);
    return row!;
  }

  async update(u: AuthUser, id: string, input: z.output<typeof update>) {
    const { version: v, ...patch } = input;
    await withUser(this.db, u.id, async (tx) => {
      const current = await this.lock(tx, id, v);
      await tx
        .update(playbookScripts)
        .set({ ...patch, version: current.version + 1, updatedBy: u.id, updatedAt: new Date() })
        .where(eq(playbookScripts.id, id));
    }).catch(duplicate);
    await this.record(u, 'playbook.update', id, Object.keys(patch));
    return { id, version: v + 1 };
  }

  async remove(u: AuthUser, id: string, v: number) {
    await withUser(this.db, u.id, async (tx) => {
      await this.lock(tx, id, v);
      await tx.delete(playbookScripts).where(eq(playbookScripts.id, id));
    });
    await this.record(u, 'playbook.delete', id);
    return { id };
  }

  private async lock(tx: Tx, id: string, v: number) {
    const [row] = await tx
      .select({ version: playbookScripts.version })
      .from(playbookScripts)
      .where(eq(playbookScripts.id, id))
      .for('update');
    if (!row) throw new NotFoundException();
    if (row.version !== v) throw new ConflictException({ code: 'VERSION_CONFLICT' });
    return row;
  }

  private record(u: AuthUser, action: string, id: string, changed?: string[]) {
    return this.audit.record({
      actorId: u.id,
      action,
      entityType: 'playbook',
      entityId: id,
      data: changed ? { fields: changed } : undefined,
    });
  }
}

@Controller('playbook')
export class PlaybookController {
  constructor(private readonly playbook: PlaybookService) {}
  @Get() list(@CurrentUser() u: SessionUser) {
    return this.playbook.list(u);
  }
  @Post() @Can('playbook:edit') create(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.playbook.create(u, validate(create, body));
  }
  @Patch(':id') @Can('playbook:edit') update(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.playbook.update(u, entityId(id), validate(update, body));
  }
  @Delete(':id') @Can('playbook:edit') remove(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.playbook.remove(u, entityId(id), validate(version, body).version);
  }
}
