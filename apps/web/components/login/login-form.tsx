'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { submitWhenComplete } from '@/lib/otp-input';
import { LAST_USER_COOKIE } from '@/lib/last-user';

/**
 * Último usuário que entrou neste aparelho, para sugerir no campo. Fica num cookie restrito a
 * /login (não vai em nenhuma outra requisição) e fora do localStorage, como o resto do CRM.
 */
function rememberUser(username: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LAST_USER_COOKIE}=${encodeURIComponent(username)}; Path=/login; Max-Age=31536000; SameSite=Lax${secure}`;
}
function forgetUser() {
  document.cookie = `${LAST_USER_COOKIE}=; Path=/login; Max-Age=0; SameSite=Lax`;
}

const GENERIC_ERROR = 'Usuário ou senha inválidos';

/**
 * Login em dois passos: usuário + senha, depois o código do autenticador (se exigido).
 * `testHint`: provisório enquanto o time testa, "Esqueci minha senha" lembra a senha do dev.
 */
export function LoginForm({ lastUser, testHint }: { lastUser?: string; testHint?: boolean }) {
  const router = useRouter();
  const [hint, setHint] = useState(false);
  const [remembered, setRemembered] = useState(lastUser);
  const [suggest, setSuggest] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const username = String(form.get('username') ?? '')
      .trim()
      .toLowerCase();
    const { data, error: err } = await authClient.signIn.username({
      username,
      password: String(form.get('password') ?? ''),
    });
    setBusy(false);
    // Nunca diz se o usuário existe: qualquer falha vira a mesma mensagem.
    if (err || !data)
      return setError(
        err?.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : GENERIC_ERROR,
      );
    rememberUser(username);
    if ('twoFactorRedirect' in data && data.twoFactorRedirect) return setStep('totp');
    router.replace('/dashboard');
    router.refresh();
  }

  async function onTotp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // envio automático + clique não mandam o código duas vezes
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
      // key distinta: sem ela o React reaproveita o <input> da senha no lugar do código (mesma
      // posição) e a senha reaparece em texto aberto.
      <form
        key="totp"
        className="flex flex-col gap-4"
        aria-label="Código de verificação"
        onSubmit={onTotp}
      >
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
            onInput={submitWhenComplete}
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
        <Note>Sem acesso ao app? Peça para a liderança redefinir o seu segundo fator.</Note>
      </form>
    );
  }

  return (
    <form key="password" className="flex flex-col gap-4" aria-label="Login" onSubmit={onPassword}>
      <h2 className="text-[28px] font-bold tracking-[-0.035em]">Bem-vindo de volta</h2>
      <p className="-mt-2 mb-1 text-[15px] text-[#515154]">
        Entre com o seu usuário da NPAC e a sua senha.
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-[13px] font-semibold text-[#3a3a3c]">
          Usuário
        </label>
        <div className="relative">
          <input
            ref={userRef}
            id="username"
            name="username"
            className="field w-full"
            placeholder="seu.usuario"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            role="combobox"
            aria-expanded={suggest && !!remembered}
            aria-controls="last-user"
            onFocus={(e) => setSuggest(!e.currentTarget.value)}
            onClick={(e) => setSuggest(!e.currentTarget.value)}
            onInput={(e) => setSuggest(!e.currentTarget.value)}
            onBlur={() => setSuggest(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSuggest(false);
            }}
          />
          {suggest && remembered && (
            <div
              id="last-user"
              className="absolute top-full right-0 left-0 z-10 mt-1.5 flex items-center gap-1 rounded-2xl bg-white p-1.5 shadow-[0_14px_34px_-12px_rgba(0,0,0,.35)]"
              // Evita o blur do campo antes do clique.
              onMouseDown={(e) => e.preventDefault()}
            >
              <ul role="listbox" aria-label="Último acesso" className="min-w-0 flex-1">
                <li
                  role="option"
                  aria-selected="false"
                  tabIndex={-1}
                  onClick={() => {
                    if (userRef.current) userRef.current.value = remembered;
                    setSuggest(false);
                    passwordRef.current?.focus();
                  }}
                  className="cursor-pointer truncate rounded-xl px-3 py-2.5 text-[15px] text-[#1d1d1f] hover:bg-black/5"
                >
                  {remembered}
                </li>
              </ul>
              <button
                type="button"
                aria-label="Esquecer"
                title="Esquecer neste aparelho"
                onClick={() => {
                  forgetUser();
                  setRemembered(undefined);
                }}
                className="grid size-9 flex-none place-items-center rounded-xl text-lg text-[#515154] hover:bg-black/5"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-[#3a3a3c]">
        Senha
        <input
          ref={passwordRef}
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
      {testHint && (
        <div className="-mt-1 text-sm">
          <button
            type="button"
            aria-expanded={hint}
            aria-controls="password-hint"
            onClick={() => setHint((v) => !v)}
            className="min-h-8 font-medium text-[#515154] underline-offset-2 hover:underline"
          >
            Esqueci minha senha
          </button>
          {hint && (
            <p id="password-hint" role="status" className="mt-1 text-[#3a3a3c]">
              Ambiente de testes: a senha de todas as contas é <b>123</b>.
            </p>
          )}
        </div>
      )}
      <button className="btn-dark" type="submit" disabled={busy}>
        Login
      </button>
      <Note>
        Cada acesso é registrado. Quem ativou o autenticador confirma a entrada com o código do app.
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
