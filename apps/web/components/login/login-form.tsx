'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

const GENERIC_ERROR = 'E-mail ou senha inválidos';

/** Login em dois passos: e-mail + senha, depois o código do autenticador (se exigido). */
export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.signIn.email({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    setBusy(false);
    // Nunca diz se o e-mail existe: qualquer falha vira a mesma mensagem.
    if (err || !data)
      return setError(
        err?.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : GENERIC_ERROR,
      );
    if ('twoFactorRedirect' in data && data.twoFactorRedirect) return setStep('totp');
    router.replace('/dashboard');
    router.refresh();
  }

  async function onTotp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\D/g, '');
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) return setError('Código inválido. Tente de novo.');
    router.replace('/dashboard');
    router.refresh();
  }

  if (step === 'totp') {
    return (
      <form className="flex flex-col gap-4" aria-label="Código de verificação" onSubmit={onTotp}>
        <button
          type="button"
          className="flex min-h-8 items-center gap-1 self-start text-sm text-[#515154]"
          onClick={() => {
            setStep('password');
            setError(null);
          }}
        >
          ‹ Voltar
        </button>
        <h2 className="text-[28px] font-bold tracking-[-0.035em]">Confirme que é você</h2>
        <p className="-mt-2 mb-1 text-[15px] text-[#515154]">
          Digite o código de 6 dígitos do seu app autenticador.
        </p>
        <label className="flex flex-col gap-2 text-[13px] font-semibold text-[#3a3a3c]">
          Código
          <input
            name="code"
            className="field text-center text-2xl font-semibold tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
          />
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button className="btn-dark" type="submit" disabled={busy}>
          Verificar e entrar
        </button>
        <Note>Sem acesso ao app? Peça para o outro Head redefinir o seu segundo fator.</Note>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-4" aria-label="Entrar" onSubmit={onPassword}>
      <h2 className="text-[28px] font-bold tracking-[-0.035em]">Bem-vindo de volta</h2>
      <p className="-mt-2 mb-1 text-[15px] text-[#515154]">
        Entre com o e-mail da NPAC e a sua senha.
      </p>
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-[#3a3a3c]">
        E-mail
        <input
          name="email"
          type="email"
          className="field"
          placeholder="voce@npac.com.br"
          autoComplete="username"
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-[#3a3a3c]">
        Senha
        <input
          name="password"
          type="password"
          className="field"
          placeholder="Sua senha"
          autoComplete="current-password"
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <button className="btn-dark" type="submit" disabled={busy}>
        Entrar
      </button>
      <Note>
        Cada acesso é registrado. Heads confirmam a entrada com o código do app autenticador.
      </Note>
    </form>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 border-t-[0.5px] border-[rgba(60,60,67,.2)] pt-3.5 text-xs leading-relaxed text-[#515154]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="mt-px h-[15px] w-[15px] flex-none text-gold-deep"
      >
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
