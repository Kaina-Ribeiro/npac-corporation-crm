'use client';
import { useRouter } from 'next/navigation';

// fetch direto (sem o client do Better Auth) para manter o JS das telas do app enxuto.
export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="h-9 rounded-full px-3.5 text-sm font-semibold text-ink2 transition-colors hover:bg-black/5 hover:text-ink"
      onClick={async () => {
        await fetch('/api/auth/sign-out', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        router.replace('/login');
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
