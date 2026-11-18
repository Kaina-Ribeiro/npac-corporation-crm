import 'server-only';
import { cache } from 'react';
import type { TeamPhotos } from '@/components/avatar';
import { apiGet } from './api';

/**
 * Fotos da equipe (NPAC-53): id → URL e nome → URL (só nome sem repetição, para o feed que só traz
 * o nome). Uma busca por render; quem não aparece fica com a inicial.
 */
export const getTeamPhotos = cache((): Promise<TeamPhotos> =>
  apiGet<TeamPhotos>('/api/team/photos'),
);
