'use client';
import { ghostButton } from '@/lib/button';
import { loginPath } from '@/lib/login-path';

// fetch direto (sem o client do Better Auth) para manter o JS das telas do app enxuto.
export function SignOutButton({
  className,
  children = 'Sair',
}: {
  className?: string;
  /** Conteúdo do botão; o nome acessível continua "Sair" (ícone com aria-hidden). */
  children?: React.ReactNode;
}) {
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
        // Quem sai do módulo volta à tela de entrada do Acompanhamento.
        window.location.replace(loginPath(window.location.pathname));
      }}
    >
      {children}
    </button>
  );
}
