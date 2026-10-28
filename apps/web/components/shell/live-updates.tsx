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
        window.location.replace(type === 'session-ended' ? '/login' : '/hoje');
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
