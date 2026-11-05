'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { FormError } from '@/components/crm-ui';

export type KindRegistro =
  'mentorado' | 'ficha' | 'conquista' | 'rdv-pessoa' | 'rdv-evento' | 'rdv-duvida' | 'rdv-quadro';

/**
 * Confirmação de exclusão (regra 6): nada é apagado sem "Confirmar exclusão", e não há como
 * desfazer. A mídia do registro vai para a fila de exclusão do servidor.
 */
export function RemoverConfirma({
  kind,
  id,
  version,
  titulo,
  texto,
  onFeito,
  onFechar,
}: {
  kind: KindRegistro;
  id: string;
  version: number;
  titulo: string;
  texto: string;
  onFeito: () => void;
  onFechar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function confirmar() {
    setOcupado(true);
    setErro('');
    try {
      await clientApi(`/api/mentoria/registros/${kind}/${id}/excluir`, 'POST', { version });
      onFeito();
      ref.current?.close();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      onClose={onFechar}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-3xl bg-[var(--bg)] p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex flex-col gap-4 p-6">
        <span
          aria-hidden="true"
          className="inline-flex size-10 items-center justify-center rounded-xl bg-rose-500/12 text-rose-700 dark:text-rose-300"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </span>
        <div>
          <h2 id={tituloId} className="text-lg font-bold tracking-[-0.02em]">
            {titulo}
          </h2>
          <p className="mt-1 text-sm text-ink2">{texto} Esta ação não pode ser desfeita.</p>
        </div>
        <FormError message={erro} />
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold active:scale-[.98]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void confirmar()}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 active:scale-[.98] disabled:opacity-50"
          >
            Confirmar exclusão
          </button>
        </div>
      </div>
    </dialog>
  );
}
