import type { PaginaInscricoes, Responsavel } from '@npac/shared/mentoria';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { MentoradosLista } from '@/components/acompanhamento/mentorados-lista';
import { rotuloResponsavel } from '@/components/acompanhamento/ui';
import { lerEu, podeCadastrar, podeExportar, sessaoDoModulo } from '@/lib/acompanhamento';
import { acCookie, mentoradosRegras, prefsParaFiltros } from '@/lib/acompanhamento-prefs';
import { apiGet, apiPost } from '@/lib/api';

export const metadata = { title: 'Mentorados' };

export default async function MentoradosPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const [responsaveis, eu, jar] = await Promise.all([
    apiGet<Responsavel[]>('/api/mentoria/responsaveis'),
    lerEu(),
    cookies(),
  ]);
  // Filtros lembrados (NPAC-46): responsável que não está mais na lista cai.
  const cookie = acCookie('mentorados', me.id);
  const regras = mentoradosRegras(responsaveis.map((r) => r.id));
  const salvo = readPrefs(jar.get(cookie)?.value, regras);
  const inicial = prefsParaFiltros(salvo);
  const pagina = await apiPost<PaginaInscricoes>('/api/mentoria/inscricoes/lista', inicial);
  return (
    <MentoradosLista
      pagina={pagina}
      // O filtro acha também quem saiu e ainda tem carteira.
      responsaveis={responsaveis.map((r) => ({ id: r.id, nome: rotuloResponsavel(r) }))}
      podeCriar={podeCadastrar(eu)}
      exportar={podeExportar(eu)}
      inicial={inicial}
      lembrar={{ cookie, valor: writePrefs(salvo, regras) }}
    />
  );
}
