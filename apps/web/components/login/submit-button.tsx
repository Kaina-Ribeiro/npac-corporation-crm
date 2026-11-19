import type { ReactNode } from 'react';

/** Botão de envio das telas de entrada: desabilitado, spinner e texto de progresso enquanto espera. */
export function SubmitButton({
  busy,
  pending,
  children,
}: {
  busy: boolean;
  pending: string;
  children: ReactNode;
}) {
  return (
    <button
      className="btn-dark inline-flex items-center justify-center gap-2.5"
      type="submit"
      disabled={busy}
      aria-busy={busy}
    >
      {busy && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
        />
      )}
      {busy ? pending : children}
    </button>
  );
}
