import type { LeadCatalog, PipelineDTO } from '@npac/shared';
import { isLeader } from '@npac/shared/enums';
import { cookies } from 'next/headers';
import { Pipeline } from '@/components/pipeline';
import { apiGet } from '@/lib/api';
import { parseHidden, pipeCookieName } from '@/lib/pipeline-columns';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Pipeline' };
export default async function PipelinePage() {
  const [initial, catalog, me, jar] = await Promise.all([
    apiGet<PipelineDTO>('/api/leads/pipeline'),
    apiGet<LeadCatalog>('/api/leads/catalog'),
    getSession(),
    cookies(),
  ]);
  const cookie = me ? pipeCookieName(me.id) : '';
  return (
    <Pipeline
      initial={initial}
      catalog={catalog}
      cookie={cookie}
      initialHidden={parseHidden(
        jar.get(cookie)?.value,
        catalog.stages.map((s) => s.key),
      )}
      canCreate={!!me && (isLeader(me.role) || me.canProspect)}
      canEditColumns={!!me && isLeader(me.role)}
      role={me?.role ?? 'SDR'}
    />
  );
}
