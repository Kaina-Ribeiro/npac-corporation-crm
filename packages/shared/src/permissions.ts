import type { Role } from './enums.js';

export const ACTIONS = [
  'lead:create',
  'lead:update',
  'lead:move',
  'lead:reassign',
  'lead:delete',
  'meeting:schedule',
  'meeting:reschedule',
  'meeting:outcome',
  'sale:register',
  'sale:reverse',
  'note:write',
  'task:write',
  'report:view',
  'report:all',
  'export:csv',
  'export:whatsapp',
  'chat:use',
  'admin:manage',
  'audit:view',
] as const;
export type Action = (typeof ACTIONS)[number];

export type AuthUser = { id: string; role: Role; canProspect: boolean; canClose: boolean };

/** Papel -> ações permitidas. Escopo por linha (qual lead) é decidido via RLS, não aqui. */
const MATRIX: Record<Role, ReadonlySet<Action>> = {
  HEAD: new Set<Action>(ACTIONS),
  SDR: new Set<Action>([
    'lead:create',
    'lead:update',
    'lead:move',
    'meeting:schedule',
    'meeting:reschedule',
    'meeting:outcome',
    'sale:register',
    'note:write',
    'task:write',
    'report:view',
    'export:whatsapp',
    'chat:use',
  ]),
  CLOSER: new Set<Action>([
    'lead:move',
    'meeting:reschedule',
    'meeting:outcome',
    'sale:register',
    'note:write',
    'task:write',
    'report:view',
    'export:whatsapp',
    'chat:use',
  ]),
};

export function can(user: Pick<AuthUser, 'role'>, action: Action): boolean {
  return MATRIX[user.role].has(action);
}
