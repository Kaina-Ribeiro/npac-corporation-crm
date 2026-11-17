'use client';
import { useEffect, useRef } from 'react';
import { readPreference } from './user-cookie';

/**
 * Voltar do navegador ou o pré-carregamento do menu reaproveitam a página renderizada antes: ao
 * montar, se o valor gravado nesta aba mudou desde então, reaplica o mais novo (uma vez). Sem nada
 * gravado nesta aba, o do servidor é o atual (`readPreference`).
 */
export function useLatestPrefs(
  cookie: string,
  serverValue: string,
  apply: (saved: string) => void,
) {
  const done = useRef(false);
  const latest = useRef(apply);
  latest.current = apply;
  useEffect(() => {
    if (done.current || !cookie) return;
    done.current = true;
    const saved = readPreference(cookie, serverValue) ?? '';
    if (saved !== serverValue) latest.current(saved);
  }, [cookie, serverValue]);
}
