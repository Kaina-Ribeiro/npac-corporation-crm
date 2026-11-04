'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAlerts, usePendingReminders } from '@/lib/alerts';

export const bell = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

/**
 * Quantos avisos pedem atenção: não lidos + reuniões das próximas 2h + lembretes de
 * confirmação vigentes. Atualiza ao vivo (SSE) e pelo relógio, sem polling.
 */
function usePending() {
  const alerts = useAlerts();
  const reminders = usePendingReminders();
  return alerts ? alerts.unread + alerts.soon.length + reminders.length : 0;
}

/** Não lidas do chat (soma dos canais da pessoa). */
export function useChatUnread() {
  return useAlerts()?.chatUnread ?? 0;
}

/** Selo de não lidas no item Chat da navegação. */
export function ChatBadge() {
  const n = useChatUnread();
  if (!n) return null;
  return (
    <span
      key={n}
      aria-label={`${n} ${n === 1 ? 'não lida' : 'não lidas'} no chat`}
      className="badge-pop ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums"
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

/**
 * Título da aba: "(N) …" com as não lidas do chat + lembretes pendentes. O Next troca o
 * <title> a cada navegação; o observador recoloca o número.
 */
export function TabTitle() {
  const chat = useChatUnread();
  const n = chat + usePendingReminders().length;
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\) /, '');
      const next = n ? `(${n > 99 ? '99+' : n}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    const head = document.querySelector('head');
    if (!head) return;
    const obs = new MutationObserver(apply);
    obs.observe(head, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, [n]);
  return null;
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums">
      {n > 99 ? '99+' : n}
    </span>
  );
}

/** Item "Avisos" da sidebar, com contador. */
export function InboxLink() {
  const n = usePending();
  const active = usePathname() === '/avisos';
  return (
    <Link
      href="/avisos"
      aria-current={active ? 'page' : undefined}
      aria-label={n ? `Avisos, ${n} novos` : 'Avisos'}
      className={`flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink2 transition-colors hover:bg-black/5 hover:text-ink [&_svg]:h-4 [&_svg]:w-4 [&_svg]:flex-none ${
        active
          ? 'bg-[var(--on)] !text-ink shadow-[inset_0_1px_0_#fff,0_2px_10px_rgba(0,0,0,.08)]'
          : ''
      }`}
    >
      {bell}
      Avisos
      <Badge n={n} />
    </Link>
  );
}

/** Ponto no "Mais" da barra inferior com avisos ou chat não lido (no celular ficam em Mais). */
export function InboxDot() {
  const n = usePending() + useChatUnread();
  if (!n) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute top-2 right-[calc(50%-18px)] size-2.5 rounded-full bg-danger ring-2 ring-[var(--bg)]"
    />
  );
}

/** Cartão "Avisos" da tela Mais. */
export function InboxCard() {
  const n = usePending();
  return (
    <Link
      href="/avisos"
      className="glass-card flex min-h-12 items-center gap-3 px-4 text-sm font-medium [&_svg]:size-5"
    >
      {bell}
      <span className="flex-1">Avisos</span>
      <Badge n={n} />
    </Link>
  );
}
