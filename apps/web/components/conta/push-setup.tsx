'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

const TEXT: Record<PushState, string> = {
  unsupported:
    'Este navegador não recebe avisos fora do CRM. Use o Chrome, Edge, Firefox ou Safari.',
  'ios-home':
    'No iPhone, os avisos só chegam com o CRM na tela inicial (iOS 16.4 ou mais novo): toque em Compartilhar → Adicionar à Tela de Início, abra o CRM por lá e volte aqui.',
  denied:
    'Os avisos foram bloqueados neste navegador. Libere em Configurações do site → Notificações e recarregue a página.',
  off: 'Receba no celular ou no computador, mesmo com o CRM fechado: mensagens novas do chat e os lembretes de confirmação das suas reuniões (1 h, 15 min e 1 min antes).',
  on: 'Este aparelho recebe os avisos do chat e os lembretes das suas reuniões.',
  'server-off': 'Os avisos fora do CRM ainda não foram ligados no servidor. Fale com a liderança.',
};

/** Ativa ou desativa o Web Push neste aparelho (cada aparelho é uma inscrição). */
export function PushSetup() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);
  async function run(fn: () => Promise<PushState>) {
    setBusy(true);
    setError('');
    try {
      setState(await fn());
    } catch (e) {
      setError((e as Error).message || 'Não foi possível ativar os avisos.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] font-bold tracking-[-0.035em]">Avisos neste aparelho</h1>
      <p className="-mt-2 text-[15px] text-ink2" aria-live="polite">
        {state ? TEXT[state] : 'Verificando este aparelho…'}
      </p>
      <p className="rounded-2xl bg-black/[.04] p-3 text-[13px] text-ink2 dark:bg-white/5">
        Por segurança, o aviso traz só o nome de quem mandou ou o nome do lead e o horário. Nunca o
        texto da mensagem, telefone ou Instagram.
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {state === 'off' && (
        <button className="btn-dark" disabled={busy} onClick={() => void run(enablePush)}>
          Ativar avisos neste aparelho
        </button>
      )}
      {state === 'on' && (
        <button
          className="h-12 rounded-2xl border border-line text-[15px] font-semibold transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await disablePush();
              return 'off';
            })
          }
        >
          Desativar neste aparelho
        </button>
      )}
      <Link href="/hoje" className="text-center text-sm font-semibold text-ink2 hover:text-ink">
        Voltar
      </Link>
    </div>
  );
}
