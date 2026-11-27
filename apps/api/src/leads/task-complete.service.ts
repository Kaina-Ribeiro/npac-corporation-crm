import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  leadNotes,
  leads,
  leadTasks,
  meetings,
  pipelineStages,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import { can, MEETING_ORIGIN_BY_STAGE, type AuthUser } from '@npac/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { scheduleMeeting } from '../meetings/meetings.service.js';
import { ReminderScheduler } from '../push/reminders.js';
import { recordActivity } from './activity.js';
import { lockLead } from './lead-mutations.service.js';
import type { RequestMeta } from './leads.service.js';
import { assertIncomeStage } from './stage-fields.js';

/**
 * Próximo passo ao concluir a tarefa (NPAC-67, Igor 23/11/2026): Agendou reunião, Novo follow-up
 * ou Ligar para a pessoa. Os dois últimos viram o próximo contato do lead.
 */
export const TASK_NEXT_STEPS = ['MEETING', 'FOLLOW_UP', 'CALL'] as const;
export type TaskNextStep = (typeof TASK_NEXT_STEPS)[number];

type TaskCompletionBase = {
  /** Versão da tarefa (a tela do Hoje não tem a do lead). */
  version: number;
  /** "O que aconteceu": vira nota da ficha. */
  note: string;
};
export type TaskCompletion = TaskCompletionBase &
  (
    | {
        next: TaskNextStep;
        /** Horário da reunião ou do próximo contato. */
        at: Date;
        /** Closer da reunião (só em MEETING). */
        closerId?: string;
        meetingId?: undefined;
      }
    | {
        /** NPAC-81: o lead já tem reunião marcada em aberto; a tarefa usa ela, sem criar outra. */
        next: 'MEETING';
        meetingId: string;
        at?: undefined;
        closerId?: undefined;
      }
  );

/** "Agendou reunião" leva o lead para o Agendado, como o Pipeline; nas outras etapas ele fica. */
const AGENDADO_DE: Partial<Record<string, string>> = {
  SONDAGEM: 'AGENDADO_DIRETO',
  EM_FOLLOW: 'AGENDADO_FOLLOW',
  NO_SHOW: 'AGENDADO_FOLLOW',
};

/**
 * Concluir a tarefa do lead pedindo o que aconteceu e o próximo passo (NPAC-67): o lead nunca fica
 * sem próxima ação. Tarefa concluída, nota e próximo passo na mesma transação, cada um na timeline
 * (só tipos e nomes de campos). Fora do `lead-mutations.service.ts` de propósito.
 */
@Injectable()
export class TaskCompleteService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reminders: ReminderScheduler,
  ) {}

  async complete(
    u: AuthUser,
    leadId: string,
    taskId: string,
    input: TaskCompletion,
    meta: RequestMeta,
  ) {
    if (input.at && input.at.getTime() <= Date.now())
      throw new BadRequestException(
        input.next === 'MEETING' ? 'Escolha um horário futuro.' : 'Escolha uma data futura.',
      );
    if (input.next === 'MEETING') {
      if (!can(u, 'meeting:schedule')) throw new ForbiddenException();
      if (!input.meetingId && !input.closerId)
        throw new BadRequestException('Escolha o closer da reunião.');
    }
    const result = await withUser(this.db, u.id, async (tx) => {
      const lead = await lockLead(tx, leadId);
      const [task] = await tx
        .select()
        .from(leadTasks)
        .where(and(eq(leadTasks.id, taskId), eq(leadTasks.leadId, leadId)))
        .for('update');
      if (!task) throw new NotFoundException();
      if (task.version !== input.version)
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'A tarefa mudou. Atualize e tente novamente.',
        });
      if (task.completedAt)
        throw new ConflictException({
          code: 'TASK_DONE',
          message: 'Esta tarefa já foi concluída.',
        });
      const [stage] = await tx
        .select({ key: pipelineStages.key })
        .from(pipelineStages)
        .where(eq(pipelineStages.id, lead.stageId));
      // Mesma regra da ação rápida: a data do pagamento combinado é do closer e da liderança.
      if (input.next !== 'MEETING' && u.role === 'SDR' && stage!.key === 'AGENDOU_PAGAMENTO')
        throw new ForbiddenException('A data do pagamento fica com o closer.');
      if (input.next === 'MEETING') await this.checkMeeting(tx, leadId, input);

      const now = new Date();
      await tx
        .update(leadTasks)
        .set({ completedAt: now, updatedAt: now, version: task.version + 1 })
        .where(eq(leadTasks.id, taskId));
      await recordActivity(tx, u, leadId, 'task.updated', ['completedAt'], taskId, meta);
      const [note] = await tx
        .insert(leadNotes)
        .values({ leadId, body: input.note, createdBy: u.id })
        .returning({ id: leadNotes.id });
      await recordActivity(tx, u, leadId, 'note.created', [], note!.id, meta);

      if (input.next === 'MEETING') {
        const target = AGENDADO_DE[stage!.key];
        if (target) {
          assertIncomeStage(lead.incomeBand, target);
          const [to] = await tx
            .select({ id: pipelineStages.id })
            .from(pipelineStages)
            .where(eq(pipelineStages.key, target));
          await tx
            .update(leads)
            .set({ stageId: to!.id, version: lead.version + 1, updatedAt: now })
            .where(eq(leads.id, leadId));
          await recordActivity(tx, u, leadId, 'lead.moved', ['stageKey'], undefined, meta);
        }
        // Lead que já passou da primeira reunião (ou numa etapa da liderança) entra como follow-up.
        // Com a reunião já marcada (NPAC-81), nada é criado.
        if (!input.meetingId)
          await scheduleMeeting(tx, u, {
            leadId,
            closerId: input.closerId!,
            scheduledAt: input.at!,
            origin: MEETING_ORIGIN_BY_STAGE[target ?? stage!.key] ?? 'FOLLOW',
          });
      } else {
        await tx
          .update(leads)
          .set({ nextContactAt: input.at!, version: lead.version + 1, updatedAt: now })
          .where(eq(leads.id, leadId));
        await recordActivity(
          tx,
          u,
          leadId,
          'lead.contact_rescheduled',
          ['nextContactAt'],
          undefined,
          meta,
        );
      }
      return { id: taskId, version: task.version + 1 };
    });
    // Depois do commit, como no POST /meetings.
    if (input.next === 'MEETING' && !input.meetingId) void this.reminders.rearm();
    return result;
  }

  /**
   * NPAC-81 (Igor, 27/11/2026): o lead já tinha reunião marcada e "Agendou reunião" criava outra
   * igual. A reunião escolhida tem de ser do lead, em aberto e futura; reunião nova no mesmo horário
   * de uma em aberto é recusada (a janelinha mostra a que existe).
   */
  private async checkMeeting(tx: Tx, leadId: string, input: TaskCompletion) {
    const open = await tx
      .select({ id: meetings.id, scheduledAt: meetings.scheduledAt })
      .from(meetings)
      .where(
        and(
          eq(meetings.leadId, leadId),
          isNull(meetings.canceledAt),
          isNull(meetings.outcome),
          gt(meetings.scheduledAt, new Date()),
        ),
      );
    if (input.meetingId) {
      if (!open.some((m) => m.id === input.meetingId))
        throw new ConflictException({
          code: 'MEETING_GONE',
          message: 'Essa reunião não está mais marcada. Atualize e tente novamente.',
        });
      return;
    }
    const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
    if (open.some((m) => minute(m.scheduledAt) === minute(input.at!)))
      throw new ConflictException({
        code: 'MEETING_EXISTS',
        message: 'O lead já tem reunião marcada nesse horário. Escolha a reunião marcada.',
      });
  }
}
