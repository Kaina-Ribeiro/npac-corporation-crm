'use client';
import { useEffect, useRef } from 'react';

/** Espera antes de reabrir o canal depois de uma queda (o padrão do EventSource é ~3 s). */
const RECONNECT_MS = 3000;

/**
 * Uma conexão por aba; o evento contém só tipo de invalidação, sem dados pessoais. A aba manda a
 * revisão do render (`/api/me`) e o servidor só responde `invalidate` se algo mudou desde então;
 * `ready` não recarrega (a ficha, a lista e o Pipeline não carregam duas vezes ao abrir). Numa
 * queda, reabre com a revisão mais nova que o servidor entregou (`router.refresh()` traz outra).
 */
export function LiveUpdates({ revision }: { revision?: string }) {
  const latest = useRef(revision);
  useEffect(() => {
    latest.current = revision;
  }, [revision]);
  useEffect(() => {
    let stream: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      const rev = latest.current;
      const current = new EventSource(
        rev ? `/api/events?rev=${encodeURIComponent(rev)}` : '/api/events',
      );
      stream = current;
      current.onmessage = (event) => {
        const { type } = JSON.parse(String(event.data)) as { type: string };
        if (type === 'invalidate') window.dispatchEvent(new Event('crm:invalidate'));
        if (type === 'session-ended' || type === 'access-required') {
          current.close();
          window.location.replace(type === 'session-ended' ? '/login' : '/');
        }
      };
      // Queda de rede ou API reiniciando: a reconexão automática repetiria a URL com a revisão
      // velha, então fecha e reabre com a atual. Resposta de erro (401) fecha de vez, como antes.
      current.onerror = () => {
        if (current.readyState === EventSource.CLOSED) return;
        current.close();
        clearTimeout(retry);
        retry = setTimeout(open, RECONNECT_MS);
      };
    };
    open();
    return () => {
      clearTimeout(retry);
      stream?.close();
    };
  }, []);
  return null;
}

export function useCrmRefresh(callback: () => void | Promise<unknown>) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    const refresh = () => {
      void Promise.resolve(latest.current()).catch(() => {});
    };
    window.addEventListener('crm:invalidate', refresh);
    return () => window.removeEventListener('crm:invalidate', refresh);
  }, []);
}

/**
 * Leva o cargo Acompanhamento ao módulo com carga completa (layout de `(comercial)`). Um redirect
 * do servidor no meio de uma navegação do navegador deixava o módulo em branco (o Next reaproveita
 * o prefetch parcial da aba, sem a página). Mora aqui para não criar outro pacote de JS.
 */
export function IrParaModulo() {
  useEffect(() => {
    window.location.replace('/acompanhamento');
  }, []);
  return (
    <p role="status" className="pt-10 text-center text-sm text-ink2">
      Abrindo o Acompanhamento…
    </p>
  );
}
