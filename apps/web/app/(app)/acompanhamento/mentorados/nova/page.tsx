import type { Responsavel } from '@npac/shared/mentoria';
import { notFound } from 'next/navigation';
import { NovaInscricao } from '@/components/acompanhamento/nova-inscricao';
import { lerEu, podeCadastrar, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Nova inscrição' };

export default async function NovaInscricaoPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  if (!podeCadastrar(await lerEu())) notFound();
  const todos = await apiGet<Responsavel[]>('/api/mentoria/responsaveis');
  // Responsável pelo acompanhamento: só o perfil Acompanhamento. Quem cadastra (ex.: Operação)
  // só vira padrão se puder ser responsável.
  // "Só a carteira" (Fase 3B, 2A): o mentorado entra na carteira de quem cadastra, sem trocar.
  const fixo = (await lerEu())?.soCarteira === true;
  const responsaveis = todos.filter((r) => r.elegivel && (!fixo || r.id === me.id));
  return (
    <NovaInscricao
      responsaveis={responsaveis}
      responsavelPadrao={responsaveis.some((r) => r.id === me.id) ? me.id : ''}
      responsavelFixo={fixo}
    />
  );
}
