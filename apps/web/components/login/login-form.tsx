'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { submitWhenComplete } from '@/lib/otp-input';
import { forgetUser, rememberUser } from '@/lib/last-user';
import type { AccessArea } from '@npac/shared/enums';
import { LOGIN_AREA } from './area';
import { Note } from './note';
import { SubmitButton } from './submit-button';

const GENERIC_ERROR = 'Usuário ou senha inválidos';

/** Login em dois passos: usuário + senha, depois o código do autenticador (se exigido). */
export function LoginForm({
  lastUser,
  area = 'COMERCIAL',
}: {
  lastUser?: string;
  area?: AccessArea;
}) {
  const tela = LOGIN_AREA[area];
  const [remembered, setRemembered] = useState(lastUser);
  const [suggest, setSuggest] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'password' | 'totp'>('password');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Trava síncrona: o estado só muda no próximo render, então um duplo clique passaria.
  const sending = useRef(false);
  const start = () => {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError(null);
    return true;
  };
  const fail = (message: string) => {
    sending.current = false;
    setBusy(false);
    setError(message);
  };

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!start()) return;
    const username = String(form.get('username') ?? '')
      .trim()
      .toLowerCase();
    const { data, error: err } = await authClient.signIn.username({
      username,
      password: String(form.get('password') ?? ''),
    });
    // Nunca diz se o usuário existe: qualquer falha vira a mesma mensagem.
    if (err || !data)
      return fail(err?.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : GENERIC_ERROR);
    rememberUser(username);
    if ('twoFactorRedirect' in data && data.twoFactorRedirect) {
      sending.current = false;
      setBusy(false);
      return setStep('totp');
    }
    // Segue "Entrando…" até a navegação trocar a tela: nada de liberar o botão antes.
    // Carga completa: o servidor manda cada cargo para a sua tela inicial (Acompanhamento → módulo;
    // pela tela do Acompanhamento, quem vê os dois cai na Fila).
    window.location.replace(tela.destino);
  }

  async function onTotp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\D/g, '');
    if (!start()) return; // envio automático + clique não mandam o código duas vezes
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    if (err) return fail('Código inválido. Tente de novo.');
    window.location.replace(tela.destino);
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
          className="flex min-h-8 items-center gap-1 self-start text-sm text-[#333336]"
          onClick={() => {
            setStep('password');
            setError(null);
          }}
        >
          ‹ Voltar
        </button>
        <h2 className="text-[28px] font-bold tracking-[-0.035em]">Confirme que é você</h2>
        <p className="-mt-2 mb-1 text-[15px] text-[#333336]">
          Digite o código de 6 dígitos do seu app autenticador.
        </p>
        <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink">
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
        <SubmitButton busy={busy} pending="Verificando…">
          Verificar e entrar
        </SubmitButton>
        <Note>Sem acesso ao app? Peça para a liderança redefinir o seu segundo fator.</Note>
      </form>
    );
  }

  return (
    // Celular: espaços e letras do protótipo, para o formulário inteiro caber sem rolar.
    <form
      key="password"
      className="flex flex-col gap-3 sm:gap-4"
      aria-label="Login"
      onSubmit={onPassword}
    >
      <h2 className="text-2xl font-bold tracking-[-0.03em] sm:text-[28px] sm:tracking-[-0.035em]">
        Bem-vindo de volta
      </h2>
      <p className="-mt-1.5 mb-0.5 text-sm text-[#333336] sm:-mt-2 sm:mb-1 sm:text-[15px]">
        Entre com o seu usuário da NPAC e a sua senha.
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-[13px] font-semibold text-ink">
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
                className="grid size-9 flex-none place-items-center rounded-xl text-lg text-[#333336] hover:bg-black/5"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink">
        Senha
        <input
          ref={passwordRef}
          name="password"
          type="password"
          className="field font-normal"
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
      <div className="-mt-1 text-sm">
        <Link
          href={`${tela.base}/esqueci`}
          className="inline-flex min-h-8 items-center font-medium text-[#333336] underline-offset-2 hover:underline"
        >
          Esqueci minha senha
        </Link>
      </div>
      <SubmitButton busy={busy} pending="Entrando…">
        Login
      </SubmitButton>
      <Note>
        Cada acesso é registrado. Quem ativou o autenticador confirma a entrada com o código do app.
      </Note>
      <p className="-mt-1 text-center text-sm text-[#333336]">
        Não tem conta?{' '}
        <Link
          href={`${tela.base}/solicitar`}
          className="font-semibold text-ink underline-offset-2 hover:underline"
        >
          Solicitar acesso
        </Link>
      </p>
    </form>
  );
}
