import {
  BackupPainel,
  type Limites,
  type Medidor,
} from '@/components/acompanhamento/backup-painel';
import { BackupView } from '@/components/acompanhamento/backup-view';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Importação e backup' };

export default async function BackupPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const [medidor, limites] = await Promise.all([
    apiGet<Medidor>('/api/mentoria/backup/medidor'),
    apiGet<Limites>('/api/mentoria/backup/limites'),
  ]);
  return <BackupView extra={<BackupPainel medidor={medidor} limites={limites} />} />;
}
