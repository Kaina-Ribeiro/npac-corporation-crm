'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

// Igual ao `minPasswordLength` da API (provisório enquanto o time testa).
const MIN = 3;

/** `first`: primeiro acesso, troca obrigatória; senão, troca voluntária pelo menu. */
export function ChangePasswordForm({ first = true }: { first?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const currentPassword = String(f.get('current') ?? '');
    const newPassword = String(f.get('new') ?? '');
    if (newPassword.length < MIN)
      return setError(`A nova senha precisa ter ${MIN} caracteres ou mais.`);
    if (newPassword !== String(f.get('confirm') ?? '')) return setError('As senhas não conferem.');
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (err) return setError('Não foi possível trocar a senha. Confira a senha atual.');
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} aria-label="Trocar senha">
      <h1 className="text-[28px] font-bold tracking-[-0.035em]">
        {first ? 'Crie a sua senha' : 'Trocar senha'}
      </h1>
      <p className="-mt-2 text-[15px] text-ink2">
        {first
          ? `No primeiro acesso, troque a senha inicial por uma só sua (${MIN}+ caracteres).`
          : `Confirme a senha atual e escolha a nova (${MIN}+ caracteres). Os outros aparelhos saem da conta.`}
      </p>
      {(
        [
          ['current', 'Senha atual', 'current-password'],
          ['new', 'Nova senha', 'new-password'],
          ['confirm', 'Confirme a nova senha', 'new-password'],
        ] as const
      ).map(([name, label, ac]) => (
        <label key={name} className="flex flex-col gap-2 text-[13px] font-semibold text-ink2">
          {label}
          <input name={name} type="password" className="field" autoComplete={ac} required />
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <button className="btn-dark" type="submit" disabled={busy}>
        Salvar senha
      </button>
      {!first && (
        <Link
          href="/dashboard"
          className="text-center text-sm font-semibold text-ink2 hover:text-ink"
        >
          Cancelar
        </Link>
      )}
    </form>
  );
}
