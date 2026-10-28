'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { submitWhenComplete } from '@/lib/otp-input';

const errorText = (error: string | null) =>
  error && (
    <p role="alert" className="text-sm font-medium text-danger">
      {error}
    </p>
  );

function PasswordField() {
  return (
    <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink2">
      Senha
      <input
        name="password"
        type="password"
        className="field"
        autoComplete="current-password"
        required
      />
    </label>
  );
}

const back = (
  <Link href="/dashboard" className="text-center text-sm font-semibold text-ink2 hover:text-ink">
    Voltar
  </Link>
);

/**
 * Autenticador opcional (qualquer cargo): ativa com senha → QR → primeiro código, ou
 * desativa com a senha. Quem ativou passa a confirmar cada login com o código.
 */
export function MfaSetup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const password = (e: FormEvent<HTMLFormElement>) =>
    String(new FormData(e.currentTarget).get('password') ?? '');

  function done() {
    router.replace('/dashboard');
    router.refresh();
  }

  async function onEnable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({ password: password(e) });
    setBusy(false);
    if (err || !data || data.method !== 'totp') return setError('Senha incorreta.');
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }));
    setSecret(new URL(data.totpURI).searchParams.get('secret'));
    setBackup(data.backupCodes);
  }

  async function onDisable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.disable({ password: password(e) });
    setBusy(false);
    if (err) return setError('Senha incorreta.');
    done();
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // envio automático + clique não mandam o código duas vezes
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\D/g, '');
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) return setError('Código inválido. Confira o relógio do celular e tente de novo.');
    done();
  }

  if (enabled) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={onDisable}
        aria-label="Desativar autenticador"
      >
        <h1 className="text-[28px] font-bold tracking-[-0.035em]">Autenticador ativo</h1>
        <p className="-mt-2 text-[15px] text-ink2">
          Cada login pede o código do app. Para desativar, confirme a sua senha.
        </p>
        <PasswordField />
        {errorText(error)}
        <button className="btn-dark" type="submit" disabled={busy}>
          Desativar autenticador
        </button>
        {back}
      </form>
    );
  }

  if (!qr) {
    return (
      <form className="flex flex-col gap-4" onSubmit={onEnable} aria-label="Confirmar senha">
        <h1 className="text-[28px] font-bold tracking-[-0.035em]">Proteja o seu acesso</h1>
        <p className="-mt-2 text-[15px] text-ink2">
          Opcional: além da senha, o login passa a pedir o código de um app autenticador (Google
          Authenticator, 1Password, Authy…). Confirme a sua senha para começar.
        </p>
        <PasswordField />
        {errorText(error)}
        <button className="btn-dark" type="submit" disabled={busy}>
          Continuar
        </button>
        {back}
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onCode} aria-label="Validar código">
      <h1 className="text-[28px] font-bold tracking-[-0.035em]">Escaneie o QR</h1>
      <p className="-mt-2 text-[15px] text-ink2">
        Abra o app autenticador, escaneie e digite o código de 6 dígitos.
      </p>
      <img
        src={qr}
        alt="QR code do autenticador"
        width={220}
        height={220}
        className="self-center rounded-2xl bg-white p-2"
      />
      {secret && (
        <p className="text-center text-xs text-ink2">
          Sem câmera? Digite a chave: <code className="font-mono text-ink">{secret}</code>
        </p>
      )}
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink2">
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
        />
      </label>
      {errorText(error)}
      <button className="btn-dark" type="submit" disabled={busy}>
        Ativar e entrar
      </button>
      <details className="text-xs text-ink2">
        <summary className="cursor-pointer font-semibold">Códigos de recuperação</summary>
        <p className="mt-2">Guarde em lugar seguro. Cada um funciona uma vez.</p>
        <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-ink">
          {backup.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </details>
    </form>
  );
}
