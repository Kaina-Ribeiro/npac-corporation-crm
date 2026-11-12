'use client';
import { useEffect, useRef } from 'react';
import { readPreference } from './user-cookie';

/**
 * Voltar do navegador reaproveita a página renderizada antes: ao montar, se o cookie mudou desde
 * então, reaplica o valor mais novo (uma vez).
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
    const saved = readPreference(cookie) ?? '';
    if (saved !== serverValue) latest.current(saved);
  }, [cookie, serverValue]);
}
