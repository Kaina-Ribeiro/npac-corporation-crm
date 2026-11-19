import { cargoDe, CARGO_INFO } from '@npac/shared/cargos';
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
export function RoleTag({
  role,
  perfil,
  className = '',
}: {
  role: Role;
  /** Perfil do Acompanhamento: o cargo Acompanhamento mostra o cargo real ("Operação"…). */
  perfil?: Perfil | null;
  className?: string;
}) {
  const cargo = cargoDe(role, perfil);
  return (
    <span className={`role role-${role} ${className}`}>
      {cargo ? CARGO_INFO[cargo].label : ROLE_LABEL[role]}
    </span>
  );
}
