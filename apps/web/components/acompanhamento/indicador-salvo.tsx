'use client';
import { useFieldSaver } from '@/lib/acompanhamento-saver';

const TEXTO = (status: string, n: number) =>
  status === 'saved'
    ? 'Tudo salvo'
    : status === 'saving'
      ? 'Salvando…'
      : status.startsWith('queued:')
        ? `Salvando ${n} na fila…`
        : status === 'unsaved'
          ? 'Não salvo: fique na página até salvar'
          : 'Não foi possível salvar';

/** "Tudo salvo / Salvando N na fila…" no cabeçalho da ficha. Avisa conflito e erro. */
export function IndicadorSalvo() {
  const { status, pendentes, aviso, limparAviso } = useFieldSaver();
  const ruim = status === 'error' || status === 'unsaved';
  return (
    <>
      <span role="status" className={`saved ${ruim ? 'ruim' : status === 'saved' ? '' : 'indo'}`}>
        <i aria-hidden="true" />
        {TEXTO(status, pendentes)}
      </span>
      {aviso && (
        <span className="aviso-campo">
          {aviso}
          <button type="button" onClick={limparAviso}>
            Ok
          </button>
        </span>
      )}
    </>
  );
}
