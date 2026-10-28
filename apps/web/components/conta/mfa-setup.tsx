'use client';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

/** Ativação do TOTP: confirma a senha, mostra o QR e valida o primeiro código. */
export function MfaSetup() {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (err || !data || data.method !== 'totp') return setError('Senha incorreta.');
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }));
    setSecret(new URL(data.totpURI).searchParams.get('secret'));
    setBackup(data.backupCodes);
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\D/g, '');
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) return setError('Código inválido. Confira o relógio do celular e tente de novo.');
    router.replace('/dashboard');
    router.refresh();
  }

  if (!qr) {
    return (
      <form className="flex flex-col gap-4" onSubmit={onPassword} aria-label="Confirmar senha">
        <h1 className="text-[28px] font-bold tracking-[-0.035em]">Proteja o seu acesso</h1>
        <p className="-mt-2 text-[15px] text-ink2">
          Heads entram com senha e com o código de um app autenticador (Google Authenticator,
          1Password, Authy…). Confirme a sua senha para começar.
        </p>
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
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button className="btn-dark" type="submit" disabled={busy}>
          Continuar
        </button>
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
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
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
