'use client';
import type { NotificationsDTO } from '@npac/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { activityVerb, activityWhen } from '@/lib/activity-text';
import { clientApi } from '@/lib/client-api';
import { quietButton } from './crm-ui';
import { useCrmRefresh } from './shell/live-updates';

const SP = 'America/Sao_Paulo';
const hour = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: SP, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );

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

/** Quantos avisos pedem atenção: não lidos + reuniões das próximas 2h. Atualiza ao vivo. */
function usePending() {
  const [n, setN] = useState(0);
  const load = async () => {
    const r = await clientApi<NotificationsDTO>('/api/notifications');
    setN(r.unread + r.soon.length);
  };
  useEffect(() => {
    void load().catch(() => {});
  }, []);
  useCrmRefresh(load);
  return n;
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

/** Ponto no "Mais" da barra inferior quando há avisos (no celular os avisos ficam em Mais). */
export function InboxDot() {
  const n = usePending();
  if (!n) return null;
  return (
    <span
      aria-label={`${n} avisos`}
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

/** Caixa de avisos (como o Inbox do Linear): o que pede ação agora e o que mudou nos seus leads. */
export function Inbox({ initial }: { initial: NotificationsDTO }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const load = async () => setData(await clientApi<NotificationsDTO>('/api/notifications'));
  useCrmRefresh(load);
  async function read(ids?: string[]) {
    setBusy(true);
    try {
      await clientApi('/api/notifications/read', 'POST', ids ? { ids } : {});
      await load();
    } finally {
      setBusy(false);
    }
  }
  const now = data.soon.length > 0 || data.overdue > 0;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">Avisos</h1>
          <p className="text-sm text-ink2">
            {data.unread ? `${data.unread} ${data.unread === 1 ? 'novo' : 'novos'}` : 'Tudo em dia'}{' '}
            · mudanças feitas por outras pessoas nos seus leads
          </p>
        </div>
        {data.unread > 0 && (
          <button className={quietButton} disabled={busy} onClick={() => void read()}>
            Marcar tudo como lido
          </button>
        )}
      </header>

      {now && (
        <section className="glass-card flex flex-col gap-1 p-2" aria-label="Agora">
          <h2 className="px-3 pt-2 pb-1 text-xs font-semibold text-ink2 uppercase">Agora</h2>
          {data.soon.map((m) => (
            <Link
              key={m.id}
              href={`/leads/${m.leadId}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span
                className="size-2 flex-none rounded-full bg-[var(--viz-1)]"
                aria-hidden="true"
              />
              <span className="flex-1">
                Reunião com <b>{m.leadName}</b> às {hour(m.at)}
              </span>
            </Link>
          ))}
          {data.overdue > 0 && (
            <Link
              href="/hoje"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              <span className="size-2 flex-none rounded-full bg-danger" aria-hidden="true" />
              <span className="flex-1">
                <b>{data.overdue}</b>{' '}
                {data.overdue === 1 ? 'follow-up atrasado' : 'follow-ups atrasados'}
              </span>
              <span className="text-xs text-ink2">Abrir Hoje</span>
            </Link>
          )}
        </section>
      )}

      <section className="glass-card p-2" aria-label="Avisos recebidos">
        {data.items.length ? (
          <ul className="flex flex-col">
            {data.items.map((i) => (
              <li key={i.id}>
                <Link
                  href={i.leadName ? `/leads/${i.leadId}` : '/avisos'}
                  onClick={() => !i.read && void read([i.id])}
                  className="flex items-start gap-3 rounded-xl px-3 py-3 text-sm hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <span
                    aria-label={i.read ? undefined : 'Não lido'}
                    className={`mt-1.5 size-2 flex-none rounded-full ${i.read ? '' : 'bg-[var(--viz-2)]'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={i.read ? 'text-ink2' : ''}>
                      <b className="font-semibold">{i.actorName.split(' ')[0]}</b>{' '}
                      {activityVerb(i.kind)}{' '}
                      <b className="font-semibold">{i.leadName ?? 'um lead fora do seu acesso'}</b>
                    </span>
                    <small className="block text-xs text-ink3">{activityWhen(i.at)}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-8 text-center text-sm text-ink2">
            Nenhum aviso ainda. Quando alguém mexer num lead seu, aparece aqui.
          </p>
        )}
      </section>
    </div>
  );
}
