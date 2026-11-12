'use client';
import { useEffect, useState } from 'react';

let push: ((text: string) => void) | undefined;

/**
 * Aviso curto de sucesso (D3, NPAC-47: o texto aprovado é "Salvo"). Um por vez: o novo substitui
 * o anterior e recomeça os 2,5 s. Erro não vem por aqui: a tela mostra a mensagem da API.
 */
export function showToast(text = 'Salvo') {
  push?.(text);
}

/** Região `role="status"` sempre presente na casca (`(app)/layout.tsx`): o leitor de tela ouve. */
export function Toaster() {
  const [toast, setToast] = useState<{ text: string; id: number; on: boolean }>();
  useEffect(() => {
    let id = 0;
    let hide = 0;
    let clear = 0;
    push = (text) => {
      clearTimeout(hide);
      clearTimeout(clear);
      setToast({ text, id: ++id, on: true });
      hide = window.setTimeout(() => {
        setToast((t) => t && { ...t, on: false });
        clear = window.setTimeout(() => setToast(undefined), 200);
      }, 2500);
    };
    return () => {
      push = undefined;
      clearTimeout(hide);
      clearTimeout(clear);
    };
  }, []);
  return (
    <div role="status" className="toast-region">
      {toast && (
        <p key={toast.id} className="toast" data-on={toast.on || undefined}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
          {toast.text}
        </p>
      )}
    </div>
  );
}
