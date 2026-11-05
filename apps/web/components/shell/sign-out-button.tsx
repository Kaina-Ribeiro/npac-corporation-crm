'use client';
import { ghostButton } from '@/lib/button';

// fetch direto (sem o client do Better Auth) para manter o JS das telas do app enxuto.
export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ?? `${ghostButton} h-9 px-3.5 text-ink2 hover:text-ink`}
      onClick={async () => {
        // Sair tira os avisos deste aparelho (outra pessoa pode usar o mesmo navegador).
        await import('@/lib/push').then((m) => m.disablePush()).catch(() => {});
        await fetch('/api/auth/sign-out', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        // Navegação completa: descarta o cache do roteador, que ainda guarda telas da sessão.
        window.location.replace('/login');
      }}
    >
      Sair
    </button>
  );
}
