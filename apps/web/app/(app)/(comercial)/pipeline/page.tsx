import type { LeadCatalog, PipelineDTO } from '@npac/shared';
import { isLeader } from '@npac/shared/enums';
import { Pipeline } from '@/components/pipeline';
import { apiGet } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Pipeline' };
export default async function PipelinePage() {
  const [initial, catalog, me] = await Promise.all([
    apiGet<PipelineDTO>('/api/leads/pipeline'),
    apiGet<LeadCatalog>('/api/leads/catalog'),
    getSession(),
  ]);
  return (
    <Pipeline
      initial={initial}
      catalog={catalog}
      canCreate={!!me && (isLeader(me.role) || me.canProspect)}
      canEditColumns={!!me && isLeader(me.role)}
      role={me?.role ?? 'SDR'}
    />
  );
}
