import { naoVistas } from '@npac/shared/novidades';
import type { Me } from '@/lib/session';

/**
 * Versão no ar + "O que mudou" (NPAC-77, opção A do protótipo `docs/prototipos/novidades/`):
 * linha própria no rodapé da sidebar (some com a barra recolhida, dentro do `.side-fold`) e no
 * cartão da conta do Mais. Componente de servidor: o arquivo das novidades não vai para o JS do
 * navegador (teto do `/leads`). O ponto dourado aparece enquanto há novidade que a pessoa não viu.
 * O clique abre a janela no modo histórico (`Novidades`, pelo `data-novidades`); o "já vi" esconde
 * o ponto sem recarregar (`html[data-novidades-vistas]`).
 */
export function VersaoRodape({
  me,
  variante,
}: {
  me: Pick<Me, 'versao' | 'novidadesVista' | 'mestre' | 'areas'>;
  variante: 'side' | 'mais';
}) {
  const versao = me.versao ?? 'dev';
  const novo = naoVistas(me, me.novidadesVista).length > 0;
  const mais = variante === 'mais';
  return (
    <button
      type="button"
      data-novidades=""
      data-novo={novo ? '' : undefined}
      aria-label={`Versão ${versao}. Ver o que mudou${novo ? ' (tem novidade)' : ''}`}
      className={
        mais
          ? '-mt-1.5 flex min-h-11 w-full items-center gap-2 border-t border-line px-1 pt-1 text-left text-sm text-ink3'
          : 'mt-1.5 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-ink3 transition-colors hover:bg-black/5 hover:text-ink dark:hover:bg-white/10'
      }
    >
      {novo && (
        <span
          aria-hidden="true"
          data-novidades-ponto=""
          className="size-1.5 flex-none rounded-full bg-gold-deep"
        />
      )}
      <span className="tabular-nums">Versão {versao}</span>
      <span className="ml-auto font-semibold text-gold-text">O que mudou{mais ? ' ›' : ''}</span>
    </button>
  );
}
