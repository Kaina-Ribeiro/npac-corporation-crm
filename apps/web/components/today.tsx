'use client';
import type { LeadCatalog, TodayDTO } from '@npac/shared';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
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

const time = (at: string | null) => (at ? new Date(at).getTime() : 0);

/**
 * Passa para Atrasados, pelo relógio do navegador, contatos e tarefas vencidos e reuniões de hoje
 * já iniciadas e sem resultado, que seguem também na agenda (mesmo objeto se nada mudou).
 */
function moveDue(d: TodayDTO): TodayDTO {
  const now = Date.now();
  const contacts = d.contacts.filter((c) => c.nextContactAt && time(c.nextContactAt) < now);
  const tasks = d.tasks.filter((t) => t.dueAt && time(t.dueAt) < now);
  const listed = new Set(d.overdueMeetings.map((m) => m.id));
  const meetings = d.meetings.filter(
    (m) => !m.outcome && !listed.has(m.id) && time(m.scheduledAt) < now,
  );
  if (!contacts.length && !tasks.length && !meetings.length) return d;
  return {
    ...d,
    contacts: d.contacts.filter((c) => !contacts.includes(c)),
    overdue: [...d.overdue, ...contacts].sort(
      (a, b) => time(a.nextContactAt) - time(b.nextContactAt),
    ),
    tasks: d.tasks.filter((t) => !tasks.includes(t)),
    overdueTasks: [...d.overdueTasks, ...tasks].sort((a, b) => time(a.dueAt) - time(b.dueAt)),
    overdueMeetings: [
      ...d.overdueMeetings,
      ...meetings.map(({ id, leadId, name, scheduledAt, version, closer }) => ({
        id,
        leadId,
        name,
        scheduledAt,
        version,
        closer,
      })),
    ].sort((a, b) => time(a.scheduledAt) - time(b.scheduledAt)),
  };
}

/**
 * Linha compacta (como no Linear): a linha inteira abre a ficha pelo link "›" esticado
 * (`after:inset-0`); botões e painéis ficam por cima dele. Ação rápida aberta e lembrete
 * (`w-full`) descem para baixo da linha.
 */
const row =
  'group/row relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-black/[.035] dark:hover:bg-white/[.05] [&>.w-full]:relative [&>.w-full]:z-[1] [&>.w-full]:order-last [&>button]:relative [&>button]:z-[1]';
const list = 'gap-x-3 3xl:columns-2 4xl:columns-3 [&>li]:break-inside-avoid';

function OpenLead({ href, name, onOpen }: { href: string; name: string; onOpen?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onOpen}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Relógio do navegador para a marca "agora" da agenda: só depois de montar (sem divergir do
  // HTML do servidor) e a cada 30 s, junto com a passagem do que venceu para Atrasados.
  const [now, setNow] = useState<number | null>(null);
  async function load(selected = filters) {
    // A resposta passa pela mesma regra do relógio: um recarregamento (SSE) não devolve a
    // "Contatos de hoje" nem a Tarefas o que já venceu no navegador.
    setData(moveDue(await clientApi<TodayDTO>('/api/today/search', 'POST', selected)));
  }
  // O que passa da hora vai sozinho para Atrasados, no navegador e sem chamar a API
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
    const saved = parseTodayFilters(
      readPreference(cookie, serializeTodayFilters(initialFilters)),
      team,
    );
    if (serializeTodayFilters(saved) === serializeTodayFilters(initialFilters)) return;
    setFilters(saved);
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
  /** Filtro vale ao escolher (NPAC-46): grava o cookie e busca. */
  async function filter(change: TodayFilters) {
    const selected = Object.fromEntries(
      Object.entries({ ...filters, ...change }).filter(([, v]) => v),
    ) as TodayFilters;
    setFilters(selected);
    savePreference(cookie, serializeTodayFilters(selected), TODAY_COOKIE_PATH);
    setBusy(true);
    setError('');
    try {
      await load(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const contactActions = (l: TodayDTO['contacts'][number]) => (
    <>
      {quick && (
        <QuickAction
          version={l.version}
          busy={busy}
          run={(body) => action(`/api/leads/${l.id}/quick-action`, 'POST', body)}
        />
      )}
      <OpenLead href={`/leads/${l.id}`} name={l.name} />
    </>
  );
  const meetingAction = (m: TodayDTO['overdueMeetings'][number]) => (
    <MeetingAction
      version={m.version}
      scheduledAt={m.scheduledAt}
      busy={busy}
      outcome={(body) => action(`/api/meetings/${m.id}/outcome`, 'POST', body)}
      reschedule={(body) => action(`/api/meetings/${m.id}`, 'PATCH', body)}
    />
  );
  const completeTask = (t: TodayDTO['tasks'][number]) => (
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
  );
  const taskDetail = (t: TodayDTO['tasks'][number]) =>
    t.leadId ? `${t.name} · ${when(t.dueAt)}` : `Pessoal · ${when(t.dueAt)}`;

  // Atrasados: uma lista só, do mais antigo para o mais recente (resposta 1A do Igor, 10/11/2026).
  const late = [
    ...data.overdue.map((c) => ({
      key: `contato-${c.id}`,
      kind: 'Contato',
      at: c.nextContactAt,
      title: c.name,
      detail: when(c.nextContactAt),
      mark: null,
      actions: contactActions(c),
    })),
    ...data.overdueMeetings.map((m) => ({
      key: `reuniao-${m.id}`,
      kind: 'Reunião',
      at: m.scheduledAt,
      title: m.name,
      detail: when(m.scheduledAt),
      mark: closerMarkFor ? (
        <CloserMark closer={m.closer} mine={m.closer.id === closerMarkFor} />
      ) : null,
      actions: (
        <>
          {meetingAction(m)}
          <OpenLead href={`/leads/${m.leadId}`} name={m.name} />
        </>
      ),
    })),
    ...data.overdueTasks.map((t) => ({
      key: `tarefa-${t.id}`,
      kind: 'Tarefa',
      at: t.dueAt,
      title: t.title,
      detail: taskDetail(t),
      mark: null,
      actions: (
        <>
          {completeTask(t)}
          {t.leadId && <OpenLead href={`/leads/${t.leadId}`} name={t.name ?? 'lead'} />}
        </>
      ),
    })),
  ].sort((a, b) => time(a.at) - time(b.at));

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
    ['hoje-atrasados', 'atrasados', late.length, true],
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
        <form
          className="glass-card flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <Field label="SDR">
            <select
              name="sdrId"
              className={control}
              value={filters.sdrId ?? ''}
              onChange={(e) => void filter({ sdrId: e.target.value || undefined })}
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
              value={filters.closerId ?? ''}
              onChange={(e) => void filter({ closerId: e.target.value || undefined })}
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
        </form>
      )}
      <FormError message={error} />

      {/* Fila de trabalho à esquerda, agenda do dia à direita (empilha abaixo de xl). */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] 3xl:grid-cols-[minmax(0,1fr)_480px]">
        <div className="glass-card flex min-w-0 flex-col gap-3 p-2 sm:p-3">
          <p className="px-3 pt-2 text-[11px] font-semibold tracking-wide text-ink3 uppercase">
            Fazer agora
          </p>
          <section id="hoje-atrasados" className="min-w-0 scroll-mt-6">
            <Heading title="Atrasados" count={late.length} tone="danger" />
            {late.length > 0 && (
              <ul className={list}>
                {late.map((item) => (
                  <li key={item.key} data-lead-row className={row}>
                    <Dot className="bg-danger" />
                    {item.mark}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold break-words">{item.title}</p>
                      <p className="text-xs break-words text-ink2">
                        <span className="mr-1.5 inline-block rounded-md bg-black/5 px-1.5 leading-[18px] font-semibold dark:bg-white/10">
                          {item.kind}
                        </span>
                        {item.detail}
                      </p>
                    </div>
                    {item.actions}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section id="hoje-contatos" className="min-w-0 scroll-mt-6">
            <Heading title="Contatos de hoje" count={data.contacts.length} />
            {data.contacts.length > 0 && (
              <ul className={list}>
                {data.contacts.map((l) => (
                  <li key={l.id} data-lead-row className={row}>
                    <Dot className="bg-[var(--viz-1)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.name}</p>
                      <p className="text-xs text-ink2">{when(l.nextContactAt)}</p>
                    </div>
                    {contactActions(l)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {data.formsNew.length > 0 && (
            <Panel id="hoje-formularios" title="Formulários novos" count={data.formsNew.length}>
              {data.formsNew.map((f) => (
                <div key={f.id} className={row}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{f.name}</p>
                    <p className="text-xs text-ink2">{when(f.at)}</p>
                  </div>
                  <OpenLead
                    href={`/leads/${f.leadId}`}
                    name={f.name}
                    onOpen={() =>
                      void clientApi('/api/notifications/read', 'POST', { ids: [f.id] }).catch(
                        () => {},
                      )
                    }
                  />
                </div>
              ))}
            </Panel>
          )}
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
                          {!m.outcome && meetingAction(m)}
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
                {completeTask(t)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.title}</p>
                  <p className="text-xs text-ink2">{taskDetail(t)}</p>
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
