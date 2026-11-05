import {
  BackupPainel,
  Pendencias,
  type Limites,
  type Medidor,
} from '@/components/acompanhamento/backup-painel';
import { BackupView } from '@/components/acompanhamento/backup-view';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Importação e backup' };

/** Importação e backup: entrada/saída por módulo, pendências do PDF, medidor e limites. */
export default async function BackupPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const [medidor, limites] = await Promise.all([
    apiGet<Medidor>('/api/mentoria/backup/medidor'),
    apiGet<Limites>('/api/mentoria/backup/limites'),
  ]);
  return (
    <BackupView
      extra={<BackupPainel medidor={medidor} limites={limites} />}
      abaixo={<Pendencias />}
    />
  );
}
