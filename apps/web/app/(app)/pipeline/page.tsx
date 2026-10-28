import type { LeadCatalog, PipelineDTO } from '@npac/shared';
import { Pipeline } from '@/components/pipeline';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Pipeline' };
export default async function PipelinePage() {
  const [initial, catalog] = await Promise.all([
    apiGet<PipelineDTO>('/api/leads/pipeline'),
    apiGet<LeadCatalog>('/api/leads/catalog'),
  ]);
  return <Pipeline initial={initial} catalog={catalog} />;
}
