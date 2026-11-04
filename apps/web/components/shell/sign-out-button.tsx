'use client';
import { disablePush } from '@/lib/push';
// fetch direto (sem o client do Better Auth) para manter o JS das telas do app enxuto.
export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={
        className ??
        'h-9 rounded-full px-3.5 text-sm font-semibold text-ink2 transition-colors hover:bg-black/5 hover:text-ink'
      }
      onClick={async () => {
        // Sair tira os avisos deste aparelho (outra pessoa pode usar o mesmo navegador).
        await disablePush();
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
