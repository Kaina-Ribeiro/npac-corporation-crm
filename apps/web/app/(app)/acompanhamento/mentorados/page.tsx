import type { PaginaInscricoes, Responsavel } from '@npac/shared/mentoria';
import { MentoradosLista } from '@/components/acompanhamento/mentorados-lista';
import { rotuloResponsavel } from '@/components/acompanhamento/ui';
import { lerEu, podeCadastrar, podeExportar, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet, apiPost } from '@/lib/api';

export const metadata = { title: 'Mentorados' };

export default async function MentoradosPage() {
  if (!(await sessaoDoModulo())) return null;
  const [pagina, responsaveis, eu] = await Promise.all([
    apiPost<PaginaInscricoes>('/api/mentoria/inscricoes/lista', {}),
    apiGet<Responsavel[]>('/api/mentoria/responsaveis'),
    lerEu(),
  ]);
  return (
    <MentoradosLista
      pagina={pagina}
      // O filtro acha também quem saiu e ainda tem carteira.
      responsaveis={responsaveis.map((r) => ({ id: r.id, nome: rotuloResponsavel(r) }))}
      podeCriar={podeCadastrar(eu)}
      exportar={podeExportar(eu)}
    />
  );
}
