import type { LeadCatalog, PipelineDTO } from '@npac/shared';
import { isLeader } from '@npac/shared/enums';
import { pipelineRules, readPipelinePrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { Pipeline } from '@/components/pipeline';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { parseHidden, pipeCookieName } from '@/lib/pipeline-columns';
import { prefsCookie } from '@/lib/screen-prefs';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Pipeline' };
export default async function PipelinePage() {
  const [catalog, me, jar] = await Promise.all([
    apiGet<LeadCatalog>('/api/leads/catalog'),
    getSession(),
    cookies(),
  ]);
  const cookie = me ? pipeCookieName(me.id) : '';
  // Filtros lembrados (NPAC-46): o servidor já busca filtrado, sem "piscar" a lista inteira.
  const prefsName = me ? prefsCookie('pipeline', me.id) : '';
  const { col, ...filters } = readPipelinePrefs(jar.get(prefsName)?.value, catalog);
  let applied = filters;
  let force = false;
  let initial: PipelineDTO;
  try {
    initial = Object.keys(filters).length
      ? await apiPost<PipelineDTO>('/api/leads/pipeline/search', filters)
      : await apiGet<PipelineDTO>('/api/leads/pipeline');
  } catch (e) {
    // Filtro lembrado que a API recusa: abre sem ele e a tela apaga o cookie.
    if (!(e instanceof ApiError && e.status === 400)) throw e;
    applied = {};
    force = true;
    initial = await apiGet<PipelineDTO>('/api/leads/pipeline');
  }
  return (
    <Pipeline
      initial={initial}
      catalog={catalog}
      cookie={cookie}
      initialHidden={parseHidden(
        jar.get(cookie)?.value,
        catalog.stages.map((s) => s.key),
      )}
      prefs={{
        cookie: prefsName,
        value: writePrefs({ ...applied, col }, pipelineRules(catalog)),
        force,
      }}
      initialFilters={applied}
      initialCol={col}
      canCreate={!!me && (isLeader(me.role) || me.canProspect)}
      canEditColumns={!!me && isLeader(me.role)}
      role={me?.role ?? 'SDR'}
    />
  );
}
