'use client';
import { ALCANCE_DICA, ALCANCE_LABEL, type Alcance } from '@npac/shared/alcance';
import { ComDica } from './dica';

/**
 * Tag de "Acessos" nas listas e no quadro "Acessos" (NPAC-54, Fase 3B: "Carteira" ou "Todos os
 * mentorados"), neutra, com a dica do que esse acesso permite. Focável para a dica abrir pelo teclado.
 */
export function TagAcesso({ alcance, className = '' }: { alcance: Alcance; className?: string }) {
  return (
    <ComDica texto={ALCANCE_DICA[alcance]}>
      {(alvo) => (
        <span {...alvo} tabIndex={0} className={`role role-TAG dica-alvo ${className}`}>
          {ALCANCE_LABEL[alcance]}
        </span>
      )}
    </ComDica>
  );
}
