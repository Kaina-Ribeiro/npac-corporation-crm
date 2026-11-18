'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { rememberUser } from '@/lib/last-user';
import { Note } from './note';
import { SubmitButton } from './submit-button';

/**
 * O link do e-mail traz o token no fragmento (`#t=…`): ele nunca vai a servidor nenhum, nem ao do
 * próprio CRM. No servidor o fragmento não existe (null): a tela já sai com o formulário.
 */
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const readToken = (hash: string) => {
  const t = new URLSearchParams(hash.replace(/^#/, '')).get('t') ?? '';
  return /^[A-Za-z0-9_-]{16,200}$/.test(t) ? t : '';
};

const EXPIRED = 'Este link venceu ou já foi usado. Peça outro.';
type Outcome = { kind: 'invalid'; message: string } | { kind: 'signin' };

/**
 * Senha nova pelo link do e-mail (protótipo "Login da equipe", tela 4). Ao abrir, confere o link
 * (mostra o usuário ou "Link vencido"); ao salvar, a API derruba as outras sessões e a tela entra.
 */
export function NewPasswordForm() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => null,
  );
  const token = hash === null ? null : readToken(hash);
  const [checked, setChecked] = useState<{ token: string; username: string } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const fail = (message: string) => {
    sending.current = false;
    setBusy(false);
    setError(message);
  };

  useEffect(() => {
    if (!token) return;
    const abort = new AbortController();
    void fetch('/api/auth/forgot-password/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: abort.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          username?: string;
          code?: string;
          message?: string;
        } | null;
        if (res.ok && body?.username) setChecked({ token, username: body.username });
        else if (body?.code === 'INVALID_TOKEN')
          setOutcome({ kind: 'invalid', message: body.message ?? EXPIRED });
      })
      // Sem rede ou abortado: o formulário fica; a troca confere o link de novo.
      .catch(() => undefined);
    return () => abort.abort();
  }, [token]);
  const username = checked && checked.token === token ? checked.username : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('confirm') ?? '')) return setError('As senhas não conferem');
    if (!token || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/forgot-password/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: password }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as {
      username?: string;
      code?: string;
      message?: string;
    } | null;
    if (!res?.ok || !body?.username) {
      if (body?.code === 'INVALID_TOKEN')
        return setOutcome({ kind: 'invalid', message: body.message ?? EXPIRED });
      if (res?.status === 429) return fail('Muitas tentativas. Aguarde alguns minutos.');
      return fail(
        res?.status === 400 && body?.message
          ? body.message
          : 'Não foi possível salvar agora. Tente de novo.',
      );
    }
    rememberUser(body.username);
    // Entra pelo login normal: mesma auditoria e, com o autenticador ligado, o mesmo código.
    const { data, error: err } = await authClient.signIn.username({
      username: body.username,
      password,
    });
    if (err || !data || ('twoFactorRedirect' in data && data.twoFactorRedirect))
      return setOutcome({ kind: 'signin' });
    // Carga completa: o servidor manda cada cargo para a sua tela inicial.
    window.location.replace('/');
  }

  if (outcome?.kind === 'signin') {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-[28px] font-bold tracking-[-0.035em]">Senha criada</h2>
        <p className="-mt-2 text-[15px] text-[#333336]">Entre com o seu usuário e a senha nova.</p>
        <Link href="/login" className="btn-dark flex items-center justify-center">
          Ir para o login
        </Link>
      </div>
    );
  }

  if (token === '' || outcome?.kind === 'invalid') {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-[28px] font-bold tracking-[-0.035em]">Link vencido</h2>
        <p className="-mt-2 text-[15px] text-[#333336]">
          {outcome?.kind === 'invalid' ? outcome.message : EXPIRED}
        </p>
        <Link href="/login/esqueci" className="btn-dark flex items-center justify-center">
          Pedir outro link
        </Link>
        <Link
          href="/login"
          className="flex min-h-11 items-center justify-center text-sm font-medium text-[#333336] underline-offset-2 hover:underline"
        >
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" aria-label="Crie a sua senha nova" onSubmit={onSubmit}>
      <h2 className="text-[28px] font-bold tracking-[-0.035em]">Crie a sua senha nova</h2>
      {/* Altura reservada: a linha do usuário chega depois da conferência do link, sem pular. */}
      <p className="-mt-2 mb-1 min-h-[1.5em] text-[15px] text-[#333336]">
        {username && (
          <>
            Para o usuário <b className="font-semibold text-ink">{username}</b>.
          </>
        )}
      </p>
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink">
        Senha nova
        <input
          name="password"
          type="password"
          className="field"
          placeholder="Senha nova"
          autoComplete="new-password"
          minLength={3}
          maxLength={128}
          required
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink">
        Confirme a senha
        <input
          name="confirm"
          type="password"
          className="field"
          placeholder="Repita a senha"
          autoComplete="new-password"
          maxLength={128}
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <SubmitButton busy={busy} pending="Salvando…">
        Salvar e entrar
      </SubmitButton>
      <Note>Ao salvar, a sua conta sai dos outros aparelhos e entra neste.</Note>
    </form>
  );
}
