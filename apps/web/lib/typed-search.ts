import { useEffect, useRef } from 'react';

/**
 * Busca ao digitar (NPAC-63): `run` roda 300 ms depois da última tecla (não a cada letra) e, com o
 * campo vazio, na hora (a lista inteira volta). Enter continua buscando já: chame `cancel` antes.
 */
export function useTypedSearch(run: (term: string) => void, wait = 300) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Sempre a versão mais nova de `run`: filtros mudados no meio da digitação valem.
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    onChange(value: string) {
      clearTimeout(timer.current);
      const term = value.trim();
      timer.current = setTimeout(() => latest.current(term), term ? wait : 0);
    },
    cancel() {
      clearTimeout(timer.current);
    },
  };
}
