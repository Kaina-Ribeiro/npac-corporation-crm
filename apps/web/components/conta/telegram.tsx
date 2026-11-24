'use client';
import type { TelegramStatusDTO } from '@npac/shared/profile';
import { useEffect, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { Erro, ICONE, Icone } from './perfil-ui';

/** Avião de papel (Telegram), no traço dos outros ícones do perfil. */
const ICONE_TELEGRAM = 'M21 4 3 11l6.5 2.2M21 4l-3.2 15.5-8.3-6.3M21 4 9.5 13.2 10 19l2.8-3.6';
const ICONE_OK = 'M5 12.5l4.5 4.5L19 7.5';

/** Enquanto espera o "Começar": confere a cada 4 s e ao voltar para a aba, até o código vencer. */
const CONFERIR_MS = 4_000;
const ERRO_TELEGRAM = 'Não deu para falar com o Telegram. Tente de novo.';

type Espera = { url: string; vence: number };

const desde = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));

/** Linha de status com ícone em caixinha, como os itens de "Este aparelho"; conectado = dourado (seleção). */
function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-3 text-[15px]">
      <span
        className={`grid size-[34px] flex-none place-items-center rounded-[10px] ${
          ok ? 'bg-gold/20 text-gold-text' : 'bg-black/5 text-ink2 dark:bg-white/10'
        }`}
      >
        <Icone d={ok ? ICONE_OK : ICONE_TELEGRAM} className="size-[18px]" />
      </span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/**
 * Meu perfil > "Avisos pelo Telegram" (NPAC-74): a pessoa conecta o próprio Telegram e recebe lá os
 * mesmos avisos do CRM. Conectar = abrir o bot com um código de uso único e tocar em "Começar"; o
 * vínculo é gravado pelo webhook, então a tela confere até ele aparecer.
 */
export function Telegram({ inicial }: { inicial: TelegramStatusDTO }) {
  const [status, setStatus] = useState(inicial);
  const [espera, setEspera] = useState<Espera | null>(null);
  const [venceu, setVenceu] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!espera) return;
    let vivo = true;
    async function conferir() {
      if (!espera) return;
      if (Date.now() >= espera.vence) {
        setEspera(null);
        setVenceu(true);
        return;
      }
      try {
        const s = await clientApi<TelegramStatusDTO>('/api/me/telegram');
        if (vivo && s.connected) {
          setStatus(s);
          setEspera(null);
        }
      } catch {
        // Falha de rede numa conferência: a próxima tenta de novo.
      }
    }
    const t = setInterval(() => void conferir(), CONFERIR_MS);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void conferir();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [espera]);

  async function agir(fn: () => Promise<void>) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setErro((e as Error).message || ERRO_TELEGRAM);
    }
    setOcupado(false);
  }

  const conectar = () =>
    agir(async () => {
      const r = await clientApi<{ url: string; expiresAt: string }>(
        '/api/me/telegram/code',
        'POST',
        {},
      );
      setVenceu(false);
      setEspera({ url: r.url, vence: new Date(r.expiresAt).getTime() });
      // Abre o bot já; se o navegador barrar a janela, o botão "Abrir o Telegram" fica na tela.
      window.open(r.url, '_blank', 'noopener');
    });

  const testar = () =>
    agir(async () => {
      await clientApi('/api/me/telegram/test', 'POST', {});
      setAviso('Enviado. Confira o Telegram.');
    });

  const desconectar = () =>
    agir(async () => {
      await clientApi('/api/me/telegram', 'DELETE');
      setStatus({ connected: false, since: null });
    });

  if (status.connected)
    return (
      <>
        <div className="flex min-h-[50px] flex-wrap items-center gap-3">
          <Status ok>
            <b className="font-semibold">Conectado</b>
            {status.since && <span className="text-ink2"> desde {desde(status.since)}.</span>}
          </Status>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:ml-auto md:w-auto">
            <button
              type="button"
              className="btn btn-secondary whitespace-nowrap"
              disabled={ocupado}
              onClick={testar}
            >
              Enviar aviso de teste
            </button>
            <button
              type="button"
              className="btn btn-ghost whitespace-nowrap"
              disabled={ocupado}
              onClick={desconectar}
            >
              Desconectar
            </button>
          </div>
        </div>
        {aviso && (
          <p role="status" className="text-[13px] font-medium text-ink2">
            {aviso}
          </p>
        )}
        {erro && <Erro>{erro}</Erro>}
      </>
    );

  if (espera)
    return (
      <>
        <div className="flex items-start gap-3 rounded-[14px] bg-white/40 px-3.5 py-3 shadow-[inset_0_0_0_0.5px_rgba(60,60,67,.18)] dark:bg-white/[0.05]">
          <span
            aria-hidden="true"
            className="mt-1.5 size-2 flex-none animate-pulse rounded-full bg-gold-deep motion-reduce:animate-none"
          />
          <p role="status" className="text-[13.5px] leading-[19px] text-ink2">
            Abra o Telegram e toque em <b className="font-semibold text-ink">“Começar”</b>. Esta
            tela muda sozinha quando der certo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={espera.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary max-md:flex-1"
          >
            <Icone d={ICONE_TELEGRAM} className="size-4" />
            Abrir o Telegram
          </a>
          <button
            type="button"
            className="btn btn-ghost max-md:flex-1"
            onClick={() => setEspera(null)}
          >
            Cancelar
          </button>
        </div>
      </>
    );

  return (
    <>
      <div className="flex min-h-[50px] flex-wrap items-center gap-3">
        <Status ok={false}>
          <span className="text-ink2">Não conectado.</span>
        </Status>
        <button
          type="button"
          className="btn btn-primary max-md:w-full md:ml-auto"
          disabled={ocupado}
          onClick={conectar}
        >
          Conectar Telegram
        </button>
      </div>
      {venceu && (
        <p className="flex items-start gap-2 text-[13px] text-ink2">
          <Icone d={ICONE.alerta} className="mt-px size-4" />O link venceu. Toque em “Conectar
          Telegram” de novo.
        </p>
      )}
      {erro && <Erro>{erro}</Erro>}
    </>
  );
}
