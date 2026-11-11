import type { MeetingOutcome } from './enums.js';
import type { ReminderStepConfirm } from './reminders.js';
type TodayTask = {
  id: string;
  leadId: string | null;
  title: string;
  name: string | null;
  dueAt: string | null;
  version: number;
};

export type TodayDTO = {
  /** Respostas do Forms ainda não vistas pela pessoa: `id` é o do aviso. */
  formsNew: { id: string; leadId: string; name: string; at: string }[];
  charges: import('./finance.js').ChargeDTO[];
  overdue: { id: string; name: string; nextContactAt: string | null; version: number }[];
  /** Reuniões que já passaram sem resultado, de qualquer data e em qualquer etapa do lead. */
  overdueMeetings: {
    id: string;
    leadId: string;
    name: string;
    scheduledAt: string;
    version: number;
    closer: { id: string; name: string };
  }[];
  /** Tarefas com prazo vencido; não aparecem em `tasks`. */
  overdueTasks: TodayTask[];
  contacts: { id: string; name: string; nextContactAt: string | null; version: number }[];
  meetings: {
    id: string;
    leadId: string;
    name: string;
    scheduledAt: string;
    outcome: MeetingOutcome | null;
    version: number;
    closer: { id: string; name: string };
    /** Só para o dono do lead (SDR): etapas já confirmadas no horário atual. */
    reminders: { confirmed: ReminderStepConfirm[] } | null;
  }[];
  tasks: TodayTask[];
};
