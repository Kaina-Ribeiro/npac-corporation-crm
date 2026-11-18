/**
 * Foto do perfil (NPAC-53) ou a inicial, no mesmo círculo. Sem `'use client'`: serve para server e
 * client components e não pesa no JS. Decorativo: o nome vem sempre ao lado (ou no `aria-label` de
 * quem usa). `className` traz tamanho, fonte e o fundo da inicial de cada tela.
 */
export function Avatar({
  name,
  photo,
  className = '',
}: {
  name: string;
  photo: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-none items-center justify-center overflow-hidden rounded-full ${className}`}
    >
      {photo ? (
        // Rota autenticada da API com cache por versão: <img> simples, sem o otimizador do Next.
        <img src={photo} alt="" className="size-full object-cover" />
      ) : (
        name.trim().slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

/** Fundo verde da própria pessoa (sidebar, Mais, topo do módulo), igual ao de antes da foto. */
export const AVATAR_EU =
  'bg-[linear-gradient(160deg,#7fe0a6,#1e9e70)] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28)]';

/** Inicial de outra pessoa da equipe (Equipe, Dashboard, Chat, Admin): círculo escuro de antes. */
export const AVATAR_OUTRO = 'bg-ink font-bold text-[var(--bg)]';

/** Mapa de fotos da equipe (`GET /api/team/photos`): id → URL e nome único → URL. */
export type TeamPhotos = { photos: Record<string, string>; names: Record<string, string> };
export const SEM_FOTOS: TeamPhotos = { photos: {}, names: {} };
