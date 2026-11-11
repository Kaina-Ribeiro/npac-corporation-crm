'use client';
import { useEffect, useRef } from 'react';

/** Uma conexão por aba; o evento contém só tipo de invalidação, sem dados pessoais. */
export function LiveUpdates() {
  useEffect(() => {
    const stream = new EventSource('/api/events');
    stream.onmessage = (event) => {
      const { type } = JSON.parse(String(event.data)) as { type: string };
      if (type === 'ready' || type === 'invalidate')
        window.dispatchEvent(new Event('crm:invalidate'));
      if (type === 'session-ended' || type === 'access-required') {
        stream.close();
        window.location.replace(type === 'session-ended' ? '/login' : '/');
      }
    };
    return () => stream.close();
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
