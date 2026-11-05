import { IndicadorSalvo } from './indicador-salvo';

/**
 * Cabeçalho das telas de lista do Acompanhamento: H1, "Tudo salvo" ao lado do título, descrição
 * embaixo e ações à direita (quebram para baixo quando não cabem). Os módulos ficam na sidebar.
 */
export function CabecalhoModulo({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
}) {
  return (
    // Como antes das abas saírem: as ações descem para a linha de baixo quando não cabem.
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[28px] font-bold tracking-[-0.03em]">{titulo}</h1>
          <IndicadorSalvo />
        </div>
        {descricao && <p className="mt-1 max-w-3xl text-sm text-ink2">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  );
}
