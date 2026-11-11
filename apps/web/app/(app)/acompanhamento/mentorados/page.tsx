import type { PaginaInscricoes } from '@npac/shared/mentoria';
import { MentoradosLista } from '@/components/acompanhamento/mentorados-lista';
import { lerEu, podeCadastrar, podeExportar, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet, apiPost } from '@/lib/api';

export const metadata = { title: 'Mentorados' };

export default async function MentoradosPage() {
  if (!(await sessaoDoModulo())) return null;
  const [pagina, responsaveis, eu] = await Promise.all([
    apiPost<PaginaInscricoes>('/api/mentoria/inscricoes/lista', {}),
    apiGet<{ id: string; nome: string }[]>('/api/mentoria/responsaveis'),
    lerEu(),
  ]);
  return (
    <MentoradosLista
      pagina={pagina}
      responsaveis={responsaveis}
      podeCriar={podeCadastrar(eu)}
      exportar={podeExportar(eu)}
    />
  );
}
