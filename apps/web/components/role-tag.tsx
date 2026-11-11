import { cargoDe, CARGO_INFO, MODULO_ADMIN_LABEL } from '@npac/shared/cargos';
import type { Role } from '@npac/shared';
import type { Perfil } from '@npac/shared/mentoria';

export const ROLE_LABEL: Record<Role, string> = {
  DIRETOR: 'Diretoria',
  HEAD: 'Head',
  SDR: 'SDR',
  CLOSER: 'Closer',
  ACOMPANHAMENTO: 'Acompanhamento',
};

/** Etiqueta do cargo (cores em globals.css, `.role-*`): dourado = liderança, azul/rosa = time,
 * verde = acompanhamento de mentorados. */
export function RoleTag({ role, className = '' }: { role: Role; className?: string }) {
  return <span className={`role role-${role} ${className}`}>{ROLE_LABEL[role]}</span>;
}

/**
 * Cargo real, com o perfil do Acompanhamento quando quem vê pode lê-lo ("Operação", "Mentor"…),
 * mais o selo do módulo e o aviso de conta antiga sem perfil.
 */
export function CargoTag({
  role,
  perfil,
  moduloAdmin,
  faltaPerfil = false,
}: {
  role: Role;
  perfil?: Perfil | null;
  moduloAdmin?: boolean | null;
  /** Só quem lê os perfis (Diretoria) sabe que falta: para o Head a etiqueta fica "Acompanhamento". */
  faltaPerfil?: boolean;
}) {
  const cargo = cargoDe(role, perfil);
  return (
    <>
      <span className={`role role-${role}`}>
        {cargo ? CARGO_INFO[cargo].label : ROLE_LABEL[role]}
      </span>
      {moduloAdmin && <span className="role role-ACOMPANHAMENTO">{MODULO_ADMIN_LABEL}</span>}
      {faltaPerfil && <span className="role role-FALTA">falta perfil</span>}
    </>
  );
}
