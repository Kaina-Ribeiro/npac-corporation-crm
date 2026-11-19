/** Foto do perfil (NPAC-53): até 200 KB depois de reduzida no navegador. */
export const FOTO_MAX_BYTES = 200 * 1024;

/** URL da foto com a versão (`user.image`): muda a cada envio, então o navegador guarda de vez. */
export function photoUrl(id: string, version: string | null | undefined): string | null {
  return version ? `/api/users/${id}/photo?v=${encodeURIComponent(version)}` : null;
}
