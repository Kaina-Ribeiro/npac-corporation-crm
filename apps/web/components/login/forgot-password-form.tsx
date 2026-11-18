'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Note } from './note';
import { SubmitButton } from './submit-button';

/** "Dá para pedir de novo em 1 minuto" (protótipo, tela 2). */
const RESEND_AFTER_MS = 60_000;

function Back() {
  return (
    <Link
      href="/login"
      className="flex min-h-8 items-center gap-1 self-start text-sm text-[#333336]"
    >
      ‹ Voltar
    </Link>
  );
}

/**
 * "Esqueci minha senha" (protótipo "Login da equipe", telas 1 e 2): usuário ou e-mail → link por
 * e-mail. A resposta é sempre a mesma, exista ou não a conta. Sem envio de e-mail configurado,
 * orienta a pedir à liderança, como antes.
 */
export function ForgotPasswordForm({
  enabled: initiallyEnabled,
  lastUser,
}: {
  enabled: boolean;
  lastUser?: string;
}) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [login, setLogin] = useState<string | null>(null);
  const [cooling, setCooling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function send(value: string) {
    if (!value || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: value }),
    }).catch(() => null);
    sending.current = false;
    setBusy(false);
    if (res?.ok) {
      setLogin(value);
      setCooling(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCooling(false), RESEND_AFTER_MS);
      return;
    }
    if (res?.status === 404) return setEnabled(false);
    setError(
      res?.status === 429
        ? 'Muitas tentativas. Tente de novo mais tarde.'
        : 'Não foi possível enviar agora. Tente de novo.',
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send(String(new FormData(e.currentTarget).get('login') ?? '').trim());
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-4">
        <Back />
        <h2 className="text-[28px] font-bold tracking-[-0.035em]">Esqueci minha senha</h2>
        <p role="status" className="-mt-2 text-[15px] text-[#333336]">
          Peça para a liderança redefinir a sua senha em Admin. Depois, entre com o seu usuário e a
          senha nova.
        </p>
        <Link href="/login" className="btn-dark flex items-center justify-center">
          Voltar ao login
        </Link>
      </div>
    );
  }

  if (login !== null) {
    return (
      <section className="flex flex-col gap-4" aria-label="Confira o seu e-mail">
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-[18px] bg-[#f6ecd4] text-[#7a560f]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[26px]"
          >
            <path d="M4 6h16v12H4z" />
            <path d="M4 7l8 6 8-6" />
          </svg>
        </span>
        <div role="status" className="flex flex-col gap-4">
          <h2 className="text-[28px] font-bold tracking-[-0.035em]">Confira o seu e-mail</h2>
          <p className="-mt-2 text-[15px] text-[#333336]">
            Se os dados estiverem certos, chega em instantes um link para criar a senha nova. O link
            vale 1 hora.
          </p>
        </div>
        <p className="text-sm text-[#4f4f54]">
          Não chegou? Olhe a caixa de spam. Dá para pedir de novo em 1 minuto.
        </p>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Link href="/login" className="btn-dark mt-1 flex items-center justify-center">
          Voltar ao login
        </Link>
        <button
          type="button"
          onClick={() => void send(login)}
          disabled={cooling || busy}
          aria-busy={busy}
          className="min-h-11 rounded-[13px] text-sm font-semibold text-[#333336] shadow-[inset_0_0_0_1px_rgba(60,60,67,.22)] disabled:opacity-50"
        >
          {busy ? 'Enviando…' : 'Enviar de novo'}
        </button>
      </section>
    );
  }

  return (
    <form className="flex flex-col gap-4" aria-label="Esqueci minha senha" onSubmit={onSubmit}>
      <Back />
      <h2 className="text-[28px] font-bold tracking-[-0.035em]">Esqueci minha senha</h2>
      <p className="-mt-2 mb-1 text-[15px] text-[#333336]">
        Digite o seu usuário ou o e-mail cadastrado. Enviamos um link para você criar uma senha
        nova.
      </p>
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink">
        Usuário ou e-mail
        <input
          name="login"
          className="field"
          placeholder="seu.usuario"
          defaultValue={lastUser}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          required
          autoFocus
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <SubmitButton busy={busy} pending="Enviando…">
        Enviar link
      </SubmitButton>
      <Note>Sem e-mail cadastrado? Peça para a liderança redefinir a sua senha.</Note>
    </form>
  );
}
