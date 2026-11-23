'use client';
import { useEffect } from 'react';

/**
 * Abre a janela de imprimir ("Salvar como PDF") quando as fotos e as letras da folha terminam de carregar
 * (spec §5.7). Foto que falha não segura a impressão.
 */
export function ImprimirAoAbrir() {
  useEffect(() => {
    let vivo = true;
    const fotos = Array.from(document.images).map((img) =>
      img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
    );
    void Promise.all([...fotos, document.fonts.ready]).then(() => {
      if (vivo) window.print();
    });
    return () => {
      vivo = false;
    };
  }, []);
  return null;
}
