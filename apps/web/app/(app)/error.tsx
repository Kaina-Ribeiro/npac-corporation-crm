'use client';

/**
 * Erro de uma tela do app (a API caiu ou respondeu 500): a casca continua e a tela mostra o aviso
 * com os textos aprovados (D3). "Tentar de novo" chama `retry()` do Next 16, que busca a tela de
 * novo no servidor; `reset()` só redesenharia o mesmo erro. O Next já registra o erro no servidor.
 */
export default function Error({ retry }: { retry: () => void }) {
  return (
    <div className="load-error">
      <section className="glass-card load-error-card">
        <span className="load-error-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3l18 18M8.5 8.6A5 5 0 0 0 7 18h10.5M17.6 12.4A4.5 4.5 0 0 1 20.9 17M11 5.2A6 6 0 0 1 17.6 9" />
          </svg>
        </span>
        <h1 className="text-lg font-semibold tracking-[-0.01em]">Não foi possível carregar.</h1>
        {/* Mesmas classes de `lib/button.ts` (`button`), sem importar o módulo neste pacote. */}
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          Tentar de novo
        </button>
      </section>
    </div>
  );
}
