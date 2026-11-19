import type { Alcance } from '@npac/shared/alcance';
import { cargoDe, CARGO_INFO, MODULO_ADMIN_LABEL } from '@npac/shared/cargos';
import type { Role } from '@npac/shared';
import type { Perfil } from '@npac/shared/mentoria';
import { ROLE_LABEL } from './role-tag';
import { TagAcesso } from './tag-acesso';

// Fora de role-tag.tsx (que entra no JS de /leads): a tag "Carteira" traz a dica, que é JS do navegador.
/**
 * Cargo real, com o perfil do Acompanhamento quando quem vê pode lê-lo ("Operação", "Mentor"…),
 * mais o selo do módulo e o aviso de conta antiga sem perfil.
 */
export function CargoTag({
  role,
  perfil,
  moduloAdmin,
  alcance,
  faltaPerfil = false,
}: {
  role: Role;
  perfil?: Perfil | null;
  moduloAdmin?: boolean | null;
  /** Fase 3B: com "Carteira", a tag de "Acessos" ao lado do selo (quem vê todos fica só com o selo). */
  alcance?: Alcance | null;
  /** Só quem lê os perfis (Diretoria) sabe que falta: para o Head a etiqueta fica "Acompanhamento". */
  faltaPerfil?: boolean;
}) {
  const cargo = cargoDe(role, perfil);
  return (
    <>
      <span className={`role role-${role}`}>
        {cargo ? CARGO_INFO[cargo].label : ROLE_LABEL[role]}
      </span>
      {alcance === 'CARTEIRA' && <TagAcesso alcance="CARTEIRA" />}
      {moduloAdmin && <span className="role role-ACOMPANHAMENTO">{MODULO_ADMIN_LABEL}</span>}
      {faltaPerfil && <span className="role role-FALTA">falta perfil</span>}
    </>
  );
}
