'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { button, dangerButton, FormError, quietButton } from '@/components/crm-ui';

/**
 * Janelinha do módulo, no padrão do `<dialog>` do CRM: confirmação, filtros e anotação. O conteúdo
 * vem em `children`; `onConfirmar` que lança mostra o erro na janela e a deixa aberta.
 */
export function Dialogo({
  titulo,
  texto,
  children,
  rotulo,
  perigo = false,
  podeConfirmar = true,
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  texto?: string;
  children?: React.ReactNode;
  rotulo: string;
  perigo?: boolean;
  podeConfirmar?: boolean;
  onConfirmar: () => void | Promise<void>;
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
      await onConfirmar();
      ref.current?.close();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <dialog ref={ref} aria-labelledby={tituloId} onClose={onFechar} className="ac-dialogo">
      <form
        method="dialog"
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
      >
        <div>
          <h2 id={tituloId} className="text-lg font-bold tracking-[-0.02em]">
            {titulo}
          </h2>
          {texto && <p className="mt-1 text-sm text-ink2">{texto}</p>}
        </div>
        {children}
        <FormError message={erro} />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={quietButton} onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button
            type="submit"
            className={perigo ? dangerButton : button}
            disabled={ocupado || !podeConfirmar}
          >
            {rotulo}
          </button>
        </div>
      </form>
    </dialog>
  );
}
