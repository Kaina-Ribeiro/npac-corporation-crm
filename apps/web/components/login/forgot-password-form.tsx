'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { SubmitButton } from './submit-button';

const LEADERSHIP = 'Peça para a liderança redefinir a sua senha em Admin.';

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
 * "Esqueci minha senha": usuário ou e-mail → link por e-mail. A resposta é sempre a mesma, exista
 * ou não a conta. Sem envio de e-mail configurado, orienta a pedir à liderança, como antes.
 */
export function ForgotPasswordForm({
  enabled: initiallyEnabled,
  lastUser,
}: {
  enabled: boolean;
  lastUser?: string;
}) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const login = String(new FormData(e.currentTarget).get('login') ?? '').trim();
    if (!login || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login }),
    }).catch(() => null);
    sending.current = false;
    setBusy(false);
    if (res?.ok) return setSent(true);
    if (res?.status === 404) return setEnabled(false);
    setError(
      res?.status === 429
        ? 'Muitas tentativas. Tente de novo mais tarde.'
        : 'Não foi possível enviar agora. Tente de novo.',
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-4">
        <Back />
        <h2 className="text-[28px] font-bold tracking-[-0.035em]">Esqueci minha senha</h2>
        <p role="status" className="-mt-2 text-[15px] text-[#333336]">
          {LEADERSHIP} Depois, entre com o seu usuário e a senha nova.
        </p>
        <Link href="/login" className="btn-dark flex items-center justify-center">
          Voltar ao login
        </Link>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-[28px] font-bold tracking-[-0.035em]">Confira o seu e-mail</h2>
        <p className="-mt-2 text-[15px] text-[#333336]">
          Se houver uma conta ativa com esse usuário ou e-mail, enviamos um link para criar uma nova
          senha. Ele vale por 1 hora.
        </p>
        <p className="text-sm text-[#333336]">
          Não chegou em alguns minutos? Veja a caixa de spam ou peça para a liderança redefinir a
          sua senha em Admin.
        </p>
        <Link href="/login" className="btn-dark flex items-center justify-center">
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" aria-label="Esqueci minha senha" onSubmit={onSubmit}>
      <Back />
      <h2 className="text-[28px] font-bold tracking-[-0.035em]">Esqueci minha senha</h2>
      <p className="-mt-2 mb-1 text-[15px] text-[#333336]">
        Digite o seu usuário ou o e-mail da sua conta. Enviamos um link para você criar uma nova
        senha.
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
    </form>
  );
}
