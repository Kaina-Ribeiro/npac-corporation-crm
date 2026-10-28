'use client';
import type { LeadCatalog, TodayDTO } from '@npac/shared';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { brasiliaInput, clientApi } from '@/lib/client-api';
import { button, control, Field, FormError, quietButton } from './crm-ui';
import { useCrmRefresh } from './shell/live-updates';

const when = (at: string | null) =>
  at
    ? new Date(at).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sem data';
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="glass-card flex flex-col gap-3 p-5">
      <h2 className="flex justify-between text-lg font-bold">
        {title}
        <span className="text-sm font-medium text-ink2">{count}</span>
      </h2>
      {!count && <p className="py-3 text-sm text-ink2">Nada por aqui hoje.</p>}
      {children}
    </section>
  );
}
export function Today({
  initial,
  name,
  catalog,
  head,
}: {
  initial: TodayDTO;
  name: string;
  catalog: LeadCatalog;
  head: boolean;
}) {
  const [data, setData] = useState(initial);
  useCrmRefresh(() => load());
  const [filters, setFilters] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(selected = filters) {
    setData(await clientApi<TodayDTO>('/api/today/search', 'POST', selected));
  }
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
    const selected = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v));
    setFilters(selected);
    setBusy(true);
    try {
      await load(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const contacts = (items: TodayDTO['contacts']) =>
    items.map((l) => (
      <div key={l.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
        <div>
          <Link href={`/leads/${l.id}`} className="text-sm font-semibold">
            {l.name}
          </Link>
          <p className="text-xs text-ink2">{when(l.nextContactAt)}</p>
        </div>
        <Link href={`/leads/${l.id}`} className={quietButton}>
          Abrir ficha
        </Link>
      </div>
    ));
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-[34px] font-bold tracking-tight">Hoje</h1>
        <p className="text-sm text-ink2">
          Olá, {name}. Seus próximos passos, no horário de Brasília.
        </p>
      </div>
      {head && (
        <form className="glass-card flex flex-wrap items-end gap-3 p-4" onSubmit={filter}>
          <Field label="SDR">
            <select name="sdrId" className={control}>
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
            <select name="closerId" className={control}>
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
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Section title="Atrasados" count={data.overdue.length}>
          {contacts(data.overdue)}
        </Section>
        <Section title="Contatos de hoje" count={data.contacts.length}>
          {contacts(data.contacts)}
        </Section>
        <Section title="Reuniões de hoje" count={data.meetings.length}>
          {data.meetings.map((m) => (
            <article key={m.id} className="border-b border-line py-3">
              <Link href={`/leads/${m.leadId}`} className="text-sm font-semibold">
                {m.name}
              </Link>
              <p className="my-2 text-xs text-ink2">
                {when(m.scheduledAt)} ·{' '}
                {m.outcome === 'DONE'
                  ? 'Realizada'
                  : m.outcome === 'NO_SHOW'
                    ? 'No-show'
                    : 'Agendada'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/leads/${m.leadId}`} className={quietButton}>
                  Ficha / reagendar
                </Link>
                {!m.outcome && (
                  <>
                    <button
                      className={quietButton}
                      disabled={busy}
                      onClick={() =>
                        void action(`/api/meetings/${m.id}/outcome`, 'POST', {
                          version: m.version,
                          outcome: 'DONE',
                        })
                      }
                    >
                      Realizada
                    </button>
                    <button
                      className={quietButton}
                      disabled={busy}
                      onClick={() =>
                        void action(`/api/meetings/${m.id}/outcome`, 'POST', {
                          version: m.version,
                          outcome: 'NO_SHOW',
                        })
                      }
                    >
                      No-show
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </Section>
        <Section title="Tarefas" count={data.tasks.length}>
          <form
            className="flex flex-col gap-3 border-b border-line pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action('/api/tasks', 'POST', {
                title: f.get('title'),
                dueAt: brasiliaInput(String(f.get('dueAt') ?? '')),
              });
            }}
          >
            <Field label="Nova tarefa pessoal">
              <input name="title" className={control} maxLength={200} required />
            </Field>
            <Field label="Prazo (Brasília)">
              <input name="dueAt" type="datetime-local" className={control} />
            </Field>
            <button className={`${button} self-start`} disabled={busy}>
              Criar tarefa pessoal
            </button>
          </form>
          {data.tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 border-b border-line py-3"
            >
              <div>
                <p className="text-sm font-semibold">{t.title}</p>
                {t.leadId ? (
                  <Link className="text-xs text-ink2" href={`/leads/${t.leadId}`}>
                    {t.name} · {when(t.dueAt)}
                  </Link>
                ) : (
                  <p className="text-xs text-ink2">Pessoal · {when(t.dueAt)}</p>
                )}
              </div>
              <button
                className={quietButton}
                disabled={busy}
                aria-label={`Concluir ${t.title}`}
                onClick={() =>
                  void action(
                    t.leadId ? `/api/leads/${t.leadId}/tasks/${t.id}` : `/api/tasks/${t.id}`,
                    'PATCH',
                    {
                      version: t.version,
                      completed: true,
                    },
                  )
                }
              >
                Concluir
              </button>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}
