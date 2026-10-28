import { auditLog, leadTimeline, type Tx } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import type { RequestMeta } from './leads.service.js';

/** Registro da mudança na mesma transação: sem conteúdo pessoal na timeline/auditoria. */
export async function recordActivity(
  tx: Tx,
  u: AuthUser,
  leadId: string,
  kind: string,
  fields: string[] = [],
  entityId?: string,
  meta: RequestMeta = {},
): Promise<void> {
  await tx.insert(leadTimeline).values({ leadId, actorId: u.id, kind, fields, entityId });
  await tx.insert(auditLog).values({
    actorId: u.id,
    action: kind === 'lead.created' ? 'lead.create' : kind,
    entityType: 'lead',
    entityId: leadId,
    data: { fields, ...(entityId ? { entityId } : {}) },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
