import type { EnviosDTO } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { Envios } from '@/components/acompanhamento/envios';
import { lerEu, podeCadastrar, sessaoDoModulo, veEnvios } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Envios físicos' };

/**
 * Envios físicos (NPAC-56, Parte 2): a gestão (Admin, Acompanhamento, Operação) e o cargo Envios. A
 * Especialista e o Mentor recebem 404, como na API.
 */
export default async function EnviosPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const eu = await lerEu();
  if (!veEnvios(eu)) notFound();
  const dados = await apiGet<EnviosDTO>('/api/mentoria/envios');
  return <Envios dados={dados} gestao={podeCadastrar(eu)} />;
}
