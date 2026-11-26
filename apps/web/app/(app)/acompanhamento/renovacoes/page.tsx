import type { PainelRenovacoes } from '@npac/shared/renovacoes';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Renovacoes } from '@/components/acompanhamento/renovacoes';
import { lerEu, sessaoDoModulo, veRenovacoes } from '@/lib/acompanhamento';
import { acCookie, filtroRenovacoesDasPrefs, renovacoesRegras } from '@/lib/acompanhamento-prefs';
import { apiGet } from '@/lib/api';
import { getTeamPhotos } from '@/lib/team-photos';

export const metadata = { title: 'Renovações e gestão' };

/**
 * Aba "Renovações e gestão" (NPAC-79, PDF aba 11): números no topo, quem chega ao 12º mês nos próximos 60 dias e a
 * situação da conversa. Admin e Acompanhamento ("só a carteira" vê a carteira, pela RLS); os demais, 404.
 */
export default async function RenovacoesPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const [eu, jar] = await Promise.all([lerEu(), cookies()]);
  if (!veRenovacoes(eu)) notFound();
  const [painel, photos] = await Promise.all([
    apiGet<PainelRenovacoes>('/api/mentoria/renovacoes'),
    getTeamPhotos(),
  ]);
  const soCarteira = !!eu?.soCarteira;
  const responsaveis = soCarteira
    ? []
    : [
        ...new Map(
          painel.itens
            .filter((i) => i.responsavelId && i.responsavel)
            .map((i) => [i.responsavelId!, i.responsavel!]),
        ),
      ]
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const regras = renovacoesRegras(responsaveis.map((r) => r.id));
  const cookie = acCookie('renovacoes', me.id);
  const salvo = readPrefs(jar.get(cookie)?.value, regras);
  return (
    <Renovacoes
      painel={painel}
      responsaveis={responsaveis}
      inicial={filtroRenovacoesDasPrefs(salvo)}
      lembrar={{ cookie, valor: writePrefs(salvo, regras) }}
      photos={photos}
    />
  );
}
