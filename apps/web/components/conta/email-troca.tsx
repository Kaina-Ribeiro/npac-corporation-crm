'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { closeWithMotion } from '@/lib/dialog-motion';
import { submitWhenComplete } from '@/lib/otp-input';

/** "Reenviar" libera 1 minuto depois de cada envio (como o "Esqueci minha senha"). */
const ESPERA_S = 60;

/** POST com a mensagem da API em português (o 429 daqui tem texto próprio). */
async function post(path: string, body: object): Promise<{ email?: string }> {
  const res = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return {};
  const dados = (await res.json().catch(() => ({}))) as { email?: string; message?: unknown };
  if (res.status === 401) {
    window.location.replace('/login');
    throw new Error('Sessão encerrada.');
  }
  if (!res.ok)
    throw new Error(
      typeof dados.message === 'string'
        ? dados.message
        : 'Não foi possível trocar o e-mail. Tente de novo.',
    );
  return dados;
}

function Passos({ passo }: { passo: 1 | 2 }) {
  return (
    <div className="mb-3 flex gap-1.5" aria-label={`Passo ${passo} de 2`} role="img">
      <i className="h-1 w-[22px] rounded-full bg-gold-deep" />
      <i
        className={`h-1 w-[22px] rounded-full ${passo === 2 ? 'bg-gold-deep' : 'bg-black/15 dark:bg-white/20'}`}
      />
    </div>
  );
}

/** Seis caixas sobre um campo só (digitar, colar e o autocompletar do celular funcionam). */
function Codigo({ erro, onDone }: { erro: boolean; onDone: (c: string) => void }) {
  const [valor, setValor] = useState('');
  const [foco, setFoco] = useState(true);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Lido do campo: o envio sozinho (6º número) chega antes do estado novo.
        const campo = e.currentTarget.elements.namedItem('code') as HTMLInputElement;
        onDone(campo.value.replace(/\D/g, '').slice(0, 6));
        setValor('');
      }}
      className="relative"
    >
      <div className="grid grid-cols-6 gap-1.5 md:gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => {
          const atual = foco && i === Math.min(valor.length, 5);
          return (
            <span
              key={i}
              className={`grid h-[52px] place-items-center rounded-[14px] bg-white/60 text-2xl font-semibold dark:bg-white/[0.07] md:h-[58px] ${
                erro
                  ? 'shadow-[inset_0_0_0_1px_var(--danger)]'
                  : atual
                    ? 'shadow-[inset_0_0_0_0.5px_rgba(60,60,67,.2),0_0_0_2px_var(--gold-ring)]'
                    : 'shadow-[inset_0_0_0_0.5px_rgba(60,60,67,.2),inset_0_1px_2px_rgba(0,0,0,.05)]'
              }`}
            >
              {valor[i] ?? ''}
            </span>
          );
        })}
      </div>
      <input
        aria-label="Código de 6 dígitos"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        value={valor}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onChange={(e) => setValor(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
        onInput={submitWhenComplete}
        className="absolute inset-0 size-full cursor-text text-transparent caret-transparent opacity-0"
      />
    </form>
  );
}

/**
 * Janelinha "Trocar e-mail" (NPAC-53): passo 1 o endereço novo, passo 2 o código de 6 dígitos que
 * chegou nele; confirma sozinho no 6º número. Carregada só no perfil (`next/dynamic`).
 */
export function EmailTroca({
  atual,
  onClose,
  onSaved,
}: {
  atual: string;
  onClose: () => void;
  onSaved: (email: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const [novo, setNovo] = useState('');
  const [passo, setPasso] = useState<1 | 2>(1);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);
  const fechar = () => closeWithMotion(ref.current, onClose);

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      await post('/api/me/email/code', { email: novo });
      setPasso(2);
      setEspera(ESPERA_S);
    } catch (err) {
      setErro((err as Error).message);
    }
    setOcupado(false);
  }
  async function confirmar(code: string) {
    setOcupado(true);
    setErro(null);
    try {
      const { email } = await post('/api/me/email/confirm', { code });
      closeWithMotion(ref.current, () => onSaved(email ?? novo));
    } catch (err) {
      setErro((err as Error).message);
      setOcupado(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
      className="dlg m-auto w-[min(460px,calc(100vw-32px))] rounded-3xl bg-[var(--bg)] p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-start gap-3 pt-5 pr-4 pl-5 md:pl-6">
        <div className="flex-1">
          <Passos passo={passo} />
          <h2 id={tituloId} className="text-xl leading-[26px] font-bold tracking-[-0.02em]">
            {passo === 1 ? 'Trocar e-mail' : 'Confirme o novo e-mail'}
          </h2>
          <p className="mt-1 text-sm text-ink2">
            {passo === 1 ? (
              'O e-mail só muda depois que você digitar o código que vai chegar no endereço novo.'
            ) : (
              <>
                Enviamos um código de 6 dígitos para <b className="text-ink">{novo}</b>. Vale por 10
                minutos.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          aria-label="Fechar"
          onClick={fechar}
          className="-mt-1 grid size-11 flex-none place-items-center rounded-xl text-ink2 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden="true"
            className="size-[18px]"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {passo === 1 ? (
        <form onSubmit={enviar} className="flex flex-col gap-3.5 px-5 pt-4 pb-5 md:px-6 md:pb-6">
          <p className="text-[13px] text-ink2">
            Hoje: <b className="font-semibold text-ink">{atual}</b>
          </p>
          <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink2">
            Novo e-mail
            <input
              type="email"
              className="field w-full"
              autoComplete="email"
              required
              autoFocus
              maxLength={200}
              value={novo}
              aria-invalid={erro ? true : undefined}
              onChange={(e) => setNovo(e.currentTarget.value)}
            />
          </label>
          {erro && (
            <p role="alert" className="text-[13px] font-medium text-danger">
              {erro}
            </p>
          )}
          <div className="mt-1 flex gap-2.5 max-md:[&>*]:flex-1 md:justify-end">
            <button type="button" className="btn btn-secondary min-h-11" onClick={fechar}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary min-h-11 px-5 text-[15px]"
              disabled={ocupado}
            >
              Enviar código
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3 px-5 pt-4 pb-5 md:px-6 md:pb-6">
          <Codigo erro={!!erro} onDone={(c) => void confirmar(c)} />
          {erro ? (
            <p role="alert" className="text-[13px] font-medium text-danger">
              {erro}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink2">Confirma sozinho ao digitar o 6º número.</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-3 text-[13px]">
            {espera > 0 ? (
              <span className="text-ink2">
                Não chegou? Veja o spam. Reenviar em {Math.floor(espera / 60)}:
                {String(espera % 60).padStart(2, '0')}
              </span>
            ) : (
              <button
                type="button"
                className="min-h-11 font-semibold text-gold-text"
                disabled={ocupado}
                onClick={() => void enviar()}
              >
                Enviar outro código
              </button>
            )}
            <button
              type="button"
              className="min-h-11 font-semibold text-gold-text"
              onClick={() => {
                setPasso(1);
                setErro(null);
              }}
            >
              Usar outro endereço
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
