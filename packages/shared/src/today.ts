import type { MeetingOutcome } from './enums.js';
export type TodayDTO = {
  overdue: { id: string; name: string; nextContactAt: string | null; version: number }[];
  contacts: { id: string; name: string; nextContactAt: string | null; version: number }[];
  meetings: {
    id: string;
    leadId: string;
    name: string;
    scheduledAt: string;
    outcome: MeetingOutcome | null;
    version: number;
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
