'use client';
import type { LeadCatalog, TodayDTO } from '@npac/shared';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { money } from '@npac/shared/money';
import { brasiliaInput, clientApi } from '@/lib/client-api';
import {
  parseTodayFilters,
  serializeTodayFilters,
  TODAY_COOKIE_PATH,
  type TodayFilters,
} from '@/lib/today-filters';
import { readPreference, savePreference } from '@/lib/user-cookie';
import { button, control, Field, FormError, quietButton } from './crm-ui';
import { useCrmRefresh } from './shell/live-updates';
import { MeetingReminder } from './meeting-reminder';
import { MeetingAction, QuickAction } from './today-quick-action';

const SP = 'America/Sao_Paulo';
const when = (at: string | null) =>
  at
    ? new Date(at).toLocaleString('pt-BR', {
        timeZone: SP,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sem data';
const hourMinute = new Intl.DateTimeFormat('pt-BR', {
  timeZone: SP,
  hour: '2-digit',
  minute: '2-digit',
});

/** Move para Atrasados os contatos vencidos pelo relógio do navegador (mesmo objeto se nada mudou). */
function moveDue(d: TodayDTO): TodayDTO {
  const now = Date.now();
  const at = (c: { nextContactAt: string | null }) =>
    c.nextContactAt ? new Date(c.nextContactAt).getTime() : 0;
  const due = d.contacts.filter((c) => c.nextContactAt && at(c) < now);
  if (!due.length) return d;
  return {
    ...d,
    contacts: d.contacts.filter((c) => !due.includes(c)),
    overdue: [...d.overdue, ...due].sort((a, b) => at(a) - at(b)),
  };
}

/**
 * Linha compacta (como no Linear): a linha inteira abre a ficha pelo link "›" esticado
 * (`after:inset-0`); botões e painéis ficam por cima dele. Ação rápida aberta e lembrete
 * (`w-full`) descem para baixo da linha.
 */
const row =
  'group/row relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-black/[.035] dark:hover:bg-white/[.05] [&>.w-full]:relative [&>.w-full]:z-[1] [&>.w-full]:order-last [&>button]:relative [&>button]:z-[1]';

function OpenLead({ href, name }: { href: string; name: string }) {
  return (
    <Link
      href={href}
      aria-label={`Abrir ficha de ${name}`}
      title="Abrir ficha"
      className="grid size-8 flex-none place-items-center rounded-full text-ink3 transition-[color,transform] duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-ink after:absolute after:inset-0 after:rounded-xl after:content-['']"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className="size-4"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={`size-2 flex-none rounded-full ${className}`} />;
}

/** Selo com a inicial do closer da reunião; dourado quando a reunião é da própria pessoa. */
function CloserMark({
  closer,
  mine,
}: {
  closer: TodayDTO['meetings'][number]['closer'];
  mine: boolean;
}) {
  const label = mine ? 'Sua reunião' : `Reunião de ${closer.name}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative z-[1] grid size-6 flex-none place-items-center rounded-full text-[11px] font-bold ${
        mine ? 'bg-gold text-black' : 'bg-black/5 text-ink2 dark:bg-white/10'
      }`}
    >
      {closer.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Título de bloco: nome, contador e, se vazio, "nada por aqui" na mesma linha. */
function Heading({ title, count, tone }: { title: string; count: number; tone?: 'danger' }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
      <h2 className="text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
      <span
        className={`min-w-6 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums ${
          tone === 'danger' && count
            ? 'bg-danger/10 text-danger'
            : 'bg-black/5 text-ink2 dark:bg-white/10'
        }`}
      >
        {count}
      </span>
      {!count && <span className="text-sm text-ink3">nada por aqui</span>}
    </div>
  );
}

/** Bloco da coluna da direita (agenda, cobranças, tarefas). */
function Panel({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section id={id} className="glass-card flex min-w-0 scroll-mt-6 flex-col p-2 sm:p-3">
      <Heading title={title} count={count} />
      {children}
    </section>
  );
}

const STATUS: Record<string, [string, string]> = {
  DONE: ['Realizada', 'text-ink3'],
  NO_SHOW: ['No-show', 'text-danger'],
  RESCHEDULED: ['Remarcada', 'text-ink3'],
};

export function Today({
  initial,
  name,
  catalog,
  head,
  quick = false,
  charges = true,
  canCreate = false,
  cookie,
  initialFilters,
  closerMarkFor,
}: {
  initial: TodayDTO;
  name: string;
  catalog: LeadCatalog;
  head: boolean;
  /** Ação rápida (Chamado/Remarcado/Próxima ação): quem edita lead, ou seja, não o Closer. */
  quick?: boolean;
  /** Cobranças: só quem registra recebimento (closer e liderança), não o SDR. */
  charges?: boolean;
  /** Botão Novo lead: mesma regra do Pipeline (liderança e quem prospecta). */
  canCreate?: boolean;
  /** Cookie da pessoa com o último filtro (pedido do Igor, 10/11/2026). */
  cookie: string;
  initialFilters: TodayFilters;
  /** ID de quem é liderança e também atende: mostra de quem é cada reunião do dia. */
  closerMarkFor?: string;
}) {
  const [data, setData] = useState(initial);
  const receiptKeys = useRef(new Map<string, string>());
  useCrmRefresh(() => load());
  const [filters, setFilters] = useState<TodayFilters>(initialFilters);
  // O que está marcado nos campos, antes de clicar em Filtrar.
  const [picked, setPicked] = useState<TodayFilters>(initialFilters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Relógio do navegador para a marca "agora" da agenda: só depois de montar (sem divergir do
  // HTML do servidor) e a cada 30 s, junto com a passagem de contatos vencidos.
  const [now, setNow] = useState<number | null>(null);
  async function load(selected = filters) {
    // A resposta passa pela mesma regra do relógio: um recarregamento (SSE) não devolve a
    // "Contatos de hoje" o que já venceu no navegador.
    setData(moveDue(await clientApi<TodayDTO>('/api/today/search', 'POST', selected)));
  }
  // Contato que passa da hora vai sozinho para Atrasados, no navegador e sem chamar a API
  // (cada busca do Hoje grava auditoria). Mudanças de dados chegam pelo useCrmRefresh.
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      setData(moveDue);
      setNow(Date.now());
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  // Voltar no navegador reaproveita a página antiga: ao montar, o cookie tem o filtro mais recente.
  const mounted = useRef({ head, cookie, team: catalog.team, initialFilters, load });
  useEffect(() => {
    const { head, cookie, team, initialFilters, load } = mounted.current;
    if (!head) return;
    const saved = parseTodayFilters(readPreference(cookie), team);
    if (serializeTodayFilters(saved) === serializeTodayFilters(initialFilters)) return;
    setFilters(saved);
    setPicked(saved);
    void load(saved).catch((e: Error) => setError(e.message));
  }, []);
  async function action(path: string, method: string, body: object) {
    setBusy(true);
    setError('');
    try {
      await clientApi(path, method, body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const selected = Object.fromEntries(
      [...new FormData(e.currentTarget)].filter(([, v]) => v),
    ) as TodayFilters;
    setFilters(selected);
    savePreference(cookie, serializeTodayFilters(selected), TODAY_COOKIE_PATH);
    setBusy(true);
    try {
      await load(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const queue = (id: string, title: string, items: TodayDTO['contacts'], tone?: 'danger') => (
    <section id={id} className="min-w-0 scroll-mt-6">
      <Heading title={title} count={items.length} tone={tone} />
      {items.length > 0 && (
        <ul className="gap-x-3 3xl:columns-2 4xl:columns-3 [&>li]:break-inside-avoid">
          {items.map((l) => (
            <li key={l.id} data-lead-row className={row}>
              <Dot className={tone === 'danger' ? 'bg-danger' : 'bg-[var(--viz-1)]'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{l.name}</p>
                <p className="text-xs text-ink2">{when(l.nextContactAt)}</p>
              </div>
              {quick && (
                <QuickAction
                  version={l.version}
                  busy={busy}
                  run={(body) => action(`/api/leads/${l.id}/quick-action`, 'POST', body)}
                />
              )}
              <OpenLead href={`/leads/${l.id}`} name={l.name} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const meetings = [...data.meetings].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
  // Onde entra a marca "agora": antes da primeira reunião que ainda não começou.
  const nowAt =
    now === null ? -1 : meetings.findIndex((m) => new Date(m.scheduledAt).getTime() > now);
  const nowMark = now !== null && (
    <li aria-hidden="true" className="flex items-center gap-2 px-3 py-1">
      <span className="text-[11px] font-semibold text-gold-deep tabular-nums">
        Agora · {hourMinute.format(now)}
      </span>
      <span className="h-px flex-1 bg-gold/50" />
    </li>
  );

  const stats = [
    ['hoje-atrasados', 'atrasados', data.overdue.length, true],
    ['hoje-contatos', 'contatos', data.contacts.length, false],
    ['hoje-reunioes', 'reuniões', data.meetings.length, false],
    ...(charges ? [['hoje-cobrancas', 'cobranças', data.charges.length, false] as const] : []),
    ['hoje-tarefas', 'tarefas', data.tasks.length, false],
  ] as const;

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[34px] font-bold tracking-tight">Hoje</h1>
          <p className="text-sm text-ink2">
            Olá, {name}. Seus próximos passos, no horário de Brasília.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Resumo do dia" className="flex flex-wrap gap-2">
            {stats.map(([id, label, n, alert]) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex h-9 items-center gap-1.5 rounded-full bg-white/60 px-3.5 text-sm text-ink2 shadow-[inset_0_0_0_0.5px_rgba(60,60,67,0.18)] hover:bg-white/90 hover:text-ink active:scale-[.97] dark:bg-white/[.06] dark:hover:bg-white/10"
              >
                {alert && n > 0 && <Dot className="bg-danger" />}
                <b className="font-semibold text-ink tabular-nums">{n}</b> {label}
              </a>
            ))}
          </nav>
          {canCreate && (
            <Link
              href="/leads/new"
              className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-[var(--bg)] active:scale-[.97]"
            >
              Novo lead
            </Link>
          )}
        </div>
      </header>
      {head && (
        <form className="glass-card flex flex-wrap items-end gap-3 p-4" onSubmit={filter}>
          <Field label="SDR">
            <select
              name="sdrId"
              className={control}
              value={picked.sdrId ?? ''}
              onChange={(e) => setPicked((p) => ({ ...p, sdrId: e.target.value || undefined }))}
            >
              <option value="">Todos</option>
              {catalog.team
                .filter((u) => u.canProspect)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Closer">
            <select
              name="closerId"
              className={control}
              value={picked.closerId ?? ''}
              onChange={(e) => setPicked((p) => ({ ...p, closerId: e.target.value || undefined }))}
            >
              <option value="">Todos</option>
              {catalog.team
                .filter((u) => u.canClose)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <button className={button} disabled={busy}>
            Filtrar Hoje
          </button>
        </form>
      )}
      <FormError message={error} />

      {/* Fila de trabalho à esquerda, agenda do dia à direita (empilha abaixo de xl). */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] 3xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="glass-card flex min-w-0 flex-col gap-3 p-2 sm:p-3">
          <p className="px-3 pt-2 text-[11px] font-semibold tracking-wide text-ink3 uppercase">
            Fazer agora
          </p>
          {queue('hoje-atrasados', 'Atrasados', data.overdue, 'danger')}
          {queue('hoje-contatos', 'Contatos de hoje', data.contacts)}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel id="hoje-reunioes" title="Reuniões de hoje" count={meetings.length}>
            {meetings.length > 0 && (
              <ol>
                {meetings.map((m, i) => {
                  const past = now !== null && new Date(m.scheduledAt).getTime() <= now;
                  const [label, tint] =
                    (m.outcome && STATUS[m.outcome]) ??
                    (past ? ['Registrar resultado', 'text-gold-deep'] : ['Agendada', 'text-ink2']);
                  return (
                    <Fragment key={m.id}>
                      {i === nowAt && nowMark}
                      <li>
                        <article className={row}>
                          <span
                            className={`w-11 flex-none text-sm font-semibold tabular-nums ${
                              m.outcome ? 'text-ink3' : ''
                            }`}
                          >
                            {hourMinute.format(new Date(m.scheduledAt))}
                          </span>
                          {closerMarkFor && (
                            <CloserMark closer={m.closer} mine={m.closer.id === closerMarkFor} />
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-sm font-semibold ${m.outcome ? 'text-ink2' : ''}`}
                            >
                              {m.name}
                            </p>
                            <p className={`text-xs ${tint}`}>{label}</p>
                          </div>
                          {m.reminders && (
                            <MeetingReminder
                              meetingId={m.id}
                              leadName={m.name}
                              scheduledAt={m.scheduledAt}
                              confirmed={m.reminders.confirmed}
                              onConfirmed={() => load()}
                            />
                          )}
                          {/* Com resultado a reunião está encerrada; correção só pela liderança, na ficha. */}
                          {!m.outcome && (
                            <MeetingAction
                              version={m.version}
                              scheduledAt={m.scheduledAt}
                              busy={busy}
                              outcome={(body) =>
                                action(`/api/meetings/${m.id}/outcome`, 'POST', body)
                              }
                              reschedule={(body) => action(`/api/meetings/${m.id}`, 'PATCH', body)}
                            />
                          )}
                          <OpenLead href={`/leads/${m.leadId}`} name={m.name} />
                        </article>
                      </li>
                    </Fragment>
                  );
                })}
                {nowAt === -1 && nowMark}
              </ol>
            )}
          </Panel>

          {charges && (
            <Panel id="hoje-cobrancas" title="Cobranças até hoje" count={data.charges.length}>
              {data.charges.map((p) => (
                <div key={p.id} className={row}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-gold-deep">
                      {money(p.amountCents)} · {when(p.dueAt)}
                    </p>
                  </div>
                  <button
                    className={`${quietButton} min-h-9 py-1.5`}
                    disabled={busy}
                    onClick={() => {
                      if (!receiptKeys.current.has(p.id))
                        receiptKeys.current.set(p.id, crypto.randomUUID());
                      void action(`/api/finance/payments/${p.id}/receive`, 'POST', {
                        version: p.version,
                        requestKey: receiptKeys.current.get(p.id),
                      });
                    }}
                  >
                    Registrar recebimento
                  </button>
                  <OpenLead href={`/leads/${p.leadId}`} name={p.name} />
                </div>
              ))}
            </Panel>
          )}

          <Panel id="hoje-tarefas" title="Tarefas" count={data.tasks.length}>
            {data.tasks.map((t) => (
              <div key={t.id} className={row}>
                <button
                  className="grid size-6 flex-none place-items-center rounded-full border border-line text-transparent transition-colors hover:border-ink hover:text-ink2 disabled:opacity-40"
                  disabled={busy}
                  aria-label={`Concluir ${t.title}`}
                  title="Concluir"
                  onClick={() =>
                    void action(
                      t.leadId ? `/api/leads/${t.leadId}/tasks/${t.id}` : `/api/tasks/${t.id}`,
                      'PATCH',
                      { version: t.version, completed: true },
                    )
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    aria-hidden="true"
                    className="size-3.5"
                  >
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="text-xs text-ink2">
                    {t.leadId ? `${t.name} · ${when(t.dueAt)}` : `Pessoal · ${when(t.dueAt)}`}
                  </p>
                </div>
                {t.leadId && <OpenLead href={`/leads/${t.leadId}`} name={t.name ?? 'lead'} />}
              </div>
            ))}
            <form
              className="@container mt-1 border-t border-line px-3 pt-3 pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action('/api/tasks', 'POST', {
                  title: f.get('title'),
                  dueAt: brasiliaInput(String(f.get('dueAt') ?? '')),
                });
              }}
            >
              <div className="grid gap-3 @sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
                <Field label="Nova tarefa pessoal">
                  <input name="title" className={control} maxLength={200} required />
                </Field>
                <Field label="Prazo (Brasília)">
                  <input name="dueAt" type="datetime-local" className={control} />
                </Field>
              </div>
              <button className={`${button} mt-3`} disabled={busy}>
                Criar tarefa pessoal
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
