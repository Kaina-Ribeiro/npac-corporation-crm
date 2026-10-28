import type { Role } from '@npac/shared';

export const ROLE_LABEL: Record<Role, string> = {
  DIRETOR: 'Diretoria',
  HEAD: 'Head',
  SDR: 'SDR',
  CLOSER: 'Closer',
};

/** Etiqueta do cargo (cores em globals.css, `.role-*`): dourado = liderança, azul/rosa = time. */
export function RoleTag({ role, className = '' }: { role: Role; className?: string }) {
  return <span className={`role role-${role} ${className}`}>{ROLE_LABEL[role]}</span>;
}
