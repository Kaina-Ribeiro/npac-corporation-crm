import type { MeetingOutcome } from './enums.js';
import type { ReminderStepConfirm } from './reminders.js';
export type TodayDTO = {
  charges: import('./finance.js').ChargeDTO[];
  overdue: { id: string; name: string; nextContactAt: string | null; version: number }[];
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
  tasks: {
    id: string;
    leadId: string | null;
    title: string;
    name: string | null;
    dueAt: string | null;
    version: number;
  }[];
};
