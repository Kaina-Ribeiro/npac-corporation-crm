'use client';
import { useEffect, useState } from 'react';
import { adiarConvite, conviteState, enablePush } from '@/lib/push';
import { button, quietButton } from '@/lib/button';
import { bell } from './inbox';
import { showToast } from './toast';

type Estado = 'off' | 'ios-home' | 'denied' | null;

const TEXTO: Record<Exclude<Estado, null>, string> = {
  off: 'Receba no celular ou no computador, mesmo com o CRM fechado, as mensagens do chat e os lembretes das suas reuniões.',
  'ios-home':
    'No iPhone, os avisos só chegam com o CRM na Tela de Início: toque em Compartilhar → Adicionar à Tela de Início e abra o CRM por lá.',
  denied:
    'Os avisos foram bloqueados neste navegador. Libere em Configurações do site → Notificações e recarregue a página.',
};

/**
 * Convite para ativar os avisos fora do CRM (pedido do Igor, 16/11/2026: a equipe não sabia que dava).
 * Aparece só quando dá para ligar e ainda não está ligado neste aparelho; "Agora não" esconde por 7 dias.
 */
export function PushInvite({ className = '' }: { className?: string }) {
  const [estado, setEstado] = useState<Estado>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    conviteState()
      .then((s) => vivo && setEstado(s))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (!estado) return null;

  const fechar = () => {
    adiarConvite();
    setEstado(null);
  };

  async function ativar() {
    setBusy(true);
    setErro('');
    try {
      const s = await enablePush();
      if (s === 'on') {
        setEstado(null);
        showToast();
      } else if (s === 'denied') setEstado('denied');
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível ativar os avisos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Avisos neste aparelho"
      className={`glass-card flex items-start gap-3.5 p-4 md:p-5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-10 flex-none items-center justify-center rounded-xl bg-[linear-gradient(160deg,#7fe0a6,#1e9e70)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_8px_20px_-10px_rgba(30,158,112,.7)] [&_svg]:size-5"
      >
        {bell}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
          Ative os avisos neste aparelho
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-ink2">{TEXTO[estado]}</p>
        {erro && (
          <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
            {erro}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {estado === 'off' ? (
            <>
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => void ativar()}
              >
                Ativar avisos
              </button>
              <button type="button" className={quietButton} onClick={fechar}>
                Agora não
              </button>
            </>
          ) : (
            <button type="button" className={quietButton} onClick={fechar}>
              Entendi
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
