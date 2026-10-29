'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

const USERNAME = /^[a-z0-9_.]{3,30}$/;

/** Pedido de acesso: a liderança aprova em Admin e a pessoa entra com a senha escolhida aqui. */
export function RequestAccessForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const field = (k: string) => String(form.get(k) ?? '');
    const username = field('username').trim().toLowerCase();
    if (!USERNAME.test(username)) return setError('Use 3 a 30 letras, números, ponto ou _');
    if (field('password') !== field('confirm')) return setError('As senhas não conferem');
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/request-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: field('name').trim(),
        username,
        email: field('email').trim(),
        password: field('password'),
      }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return setSent(true);
    setError(
      res?.status === 429
        ? 'Muitas tentativas. Tente de novo mais tarde.'
        : 'Não foi possível enviar. Confira os dados e tente de novo.',
    );
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <h2 className="text-[28px] font-bold tracking-[-0.035em]">Pedido enviado.</h2>
        <p className="-mt-2 text-[15px] text-[#515154]">
          A liderança vai analisar e você entra com o usuário e a senha que escolheu.
        </p>
        <Link href="/login" className="btn-dark flex items-center justify-center">
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" aria-label="Solicitar acesso" onSubmit={onSubmit}>
      <Link
        href="/login"
        className="flex min-h-8 items-center gap-1 self-start text-sm text-[#515154]"
      >
        ‹ Voltar
      </Link>
      <h2 className="text-[28px] font-bold tracking-[-0.035em]">Solicitar acesso</h2>
      <p className="-mt-2 mb-1 text-[15px] text-[#515154]">
        A liderança aprova o pedido e define o seu cargo.
      </p>
      <Input label="Nome" name="name" autoComplete="name" maxLength={120} />
      <Input
        label="Usuário"
        name="username"
        placeholder="seu.usuario"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={30}
      />
      <Input label="E-mail" name="email" type="email" autoComplete="email" maxLength={200} />
      <Input
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={3}
        maxLength={128}
      />
      <Input
        label="Confirme a senha"
        name="confirm"
        type="password"
        autoComplete="new-password"
        maxLength={128}
      />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <button className="btn-dark" type="submit" disabled={busy}>
        Pedir acesso
      </button>
    </form>
  );
}

function Input({ label, ...props }: { label: string } & React.ComponentProps<'input'>) {
  return (
    <label className="flex flex-col gap-2 text-[13px] font-semibold text-[#3a3a3c]">
      {label}
      <input className="field" required {...props} />
    </label>
  );
}
