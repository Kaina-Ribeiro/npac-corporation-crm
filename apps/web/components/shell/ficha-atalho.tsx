'use client';
import { useEffect, useState } from 'react';
import { EVENTO_ULTIMA_FICHA } from '@/lib/ultima-ficha';

/**
 * 2ª linha do item "Ficha do mentorado": para onde ele leva. O servidor manda a última ficha no
 * carregamento; depois, a ficha avisa ao abrir (o layout não roda de novo na navegação). O nome
 * fica só na memória da página, nunca em cookie.
 */
export function FichaAtalho({ inicial }: { inicial: string | null }) {
  const [nome, setNome] = useState(inicial);
  useEffect(() => setNome(inicial), [inicial]);
  useEffect(() => {
    const ouvir = (e: Event) => setNome((e as CustomEvent<string>).detail);
    window.addEventListener(EVENTO_ULTIMA_FICHA, ouvir);
    return () => window.removeEventListener(EVENTO_ULTIMA_FICHA, ouvir);
  }, []);
  return (
    <span className="block truncate text-[11px] leading-tight font-normal text-ink3">
      {nome ? `Última: ${nome}` : 'Escolha em Mentorados'}
    </span>
  );
}
