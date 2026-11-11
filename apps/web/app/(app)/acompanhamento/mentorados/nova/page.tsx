import { notFound } from 'next/navigation';
import { NovaInscricao } from '@/components/acompanhamento/nova-inscricao';
import { lerEu, podeCadastrar, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Nova inscrição' };

export default async function NovaInscricaoPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  if (!podeCadastrar(await lerEu())) notFound();
  const responsaveis = await apiGet<{ id: string; nome: string }[]>('/api/mentoria/responsaveis');
  return (
    <NovaInscricao
      responsaveis={responsaveis}
      responsavelPadrao={responsaveis.some((r) => r.id === me.id) ? me.id : ''}
    />
  );
}
