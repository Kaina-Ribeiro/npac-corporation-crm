import type { FilaDTO, MensagemModelo } from '@npac/shared/mentoria';
import { Fila } from '@/components/acompanhamento/fila';
import { lerEu, podeExportar, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet, apiPost } from '@/lib/api';

export const metadata = { title: 'Fila do dia' };

/** Fila do dia (§5, D18). "Minha fila" ou "Equipe" pela URL; o item aberto também (`?item=`). */
export default async function FilaPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const { ver } = await searchParams;
  const escopo = ver === 'equipe' ? 'EQUIPE' : ver === 'minha' ? 'MINHA' : undefined;
  const [dados, mensagens, eu] = await Promise.all([
    apiPost<FilaDTO>('/api/mentoria/fila', escopo ? { escopo } : {}),
    apiGet<MensagemModelo[]>('/api/mentoria/mensagens'),
    lerEu(),
  ]);
  return (
    <Fila
      dados={dados}
      mensagens={mensagens}
      euId={me.id}
      temPerfil={!!eu?.perfil}
      admin={!!eu?.admin}
      exportar={podeExportar(eu)}
    />
  );
}
