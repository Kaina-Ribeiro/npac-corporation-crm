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
  'playbook:edit',
  'admin:manage',
  'audit:view',
  // Módulo Acompanhamento (mentorados): só Diretoria e a equipe de acompanhamento.
  'mentoria:view',
  'mentoria:edit',
  'mentoria:export',
] as const;
export type Action = (typeof ACTIONS)[number];

export type AuthUser = { id: string; role: Role; canProspect: boolean; canClose: boolean };

/** Papel -> ações permitidas. Escopo por linha (qual lead) é decidido via RLS, não aqui. */
const MATRIX: Record<Role, ReadonlySet<Action>> = {
  DIRETOR: new Set<Action>(ACTIONS),
  // O Head não vê dados de mentorados (saúde, fé, dinheiro): só a Diretoria e o Acompanhamento.
  HEAD: new Set<Action>(ACTIONS.filter((a) => !a.startsWith('mentoria:'))),
  SDR: new Set<Action>([
    'lead:create',
    'lead:update',
    'lead:move',
    'meeting:schedule',
    'meeting:reschedule',
    'meeting:outcome',
    // Sem 'sale:register': vendas e pagamentos são do closer e da liderança (pedido do cliente,
    // 04/11/2026). O SDR só marca o resultado da reunião.
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
  ACOMPANHAMENTO: new Set<Action>(['mentoria:view', 'mentoria:edit', 'mentoria:export']),
};

export function can(user: Pick<AuthUser, 'role'>, action: Action): boolean {
  return MATRIX[user.role].has(action);
}
