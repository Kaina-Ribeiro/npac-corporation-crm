import { BackupView } from '@/components/acompanhamento/backup-view';
import { sessaoDoModulo } from '@/lib/acompanhamento';

export const metadata = { title: 'Importação e backup' };

export default async function BackupPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  return <BackupView />;
}
