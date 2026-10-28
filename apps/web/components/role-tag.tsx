import type { Role } from '@npac/shared';

export const ROLE_LABEL: Record<Role, string> = {
  DIRETOR: 'Diretoria',
  HEAD: 'Head',
  SDR: 'SDR',
  CLOSER: 'Closer',
};

/** Etiqueta do cargo (estilos em globals.css, `.role-*`): hierarquia pelo peso visual. */
export function RoleTag({ role, className = '' }: { role: Role; className?: string }) {
  return <span className={`role role-${role} ${className}`}>{ROLE_LABEL[role]}</span>;
}
