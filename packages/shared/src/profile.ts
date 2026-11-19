/** Meu perfil (NPAC-53): regras puras, sem zod (o web importa por `@npac/shared/profile`). */

export const PROFILE_NAME_MIN = 2;
export const PROFILE_NAME_MAX = 80;
export const PROFILE_NAME_ERROR = 'Digite o seu nome.';

/** Nome sem os espaços das pontas, ou `null` se não serve (vazio, curto ou longo demais). */
export function cleanProfileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name.length >= PROFILE_NAME_MIN && name.length <= PROFILE_NAME_MAX ? name : null;
}

/** `GET /api/me/profile`. `photo` = URL com a versão; `mailEnabled` = troca de e-mail por código. */
export type ProfileDTO = {
  name: string;
  username: string;
  email: string;
  photo: string | null;
  mailEnabled: boolean;
};
