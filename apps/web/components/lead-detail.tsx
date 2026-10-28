'use client';
import type { LeadActivityDTO, LeadCatalog, LeadDTO, MeetingDTO, Role } from '@npac/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { brasiliaInput, clientApi } from '@/lib/client-api';
import { button, control, Field, FormError, quietButton } from './crm-ui';
import { LeadForm } from './lead-form';

const date = (s: string) =>
  new Date(s).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
const EVENT_LABEL: Record<string, string> = {
  'lead.created': 'Lead cadastrado',
  'lead.updated': 'Dados atualizados',
  'lead.moved': 'Etapa alterada',
  'lead.reassigned': 'Responsável alterado',
  'note.created': 'Nota adicionada',
  'note.updated': 'Nota atualizada',
  'task.created': 'Tarefa criada',
  'task.updated': 'Tarefa atualizada',
  'meeting.scheduled': 'Reunião agendada',
  'meeting.rescheduled': 'Reunião remarcada',
  'meeting.canceled': 'Reunião cancelada',
  'meeting.outcome': 'Resultado da reunião registrado',
};

export function LeadDetail({
  lead,
  activity,
  catalog,
  meetings,
  me,
}: {
  lead: LeadDTO;
  activity: LeadActivityDTO;
  catalog: LeadCatalog;
  meetings: MeetingDTO[];
  me: { id: string; role: Role };
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function mutate(path: string, method: string, body: object) {
    setBusy(true);
    setError('');
    try {
      await clientApi(path, method, body);
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const add = (kind: 'notes' | 'tasks') => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void mutate(
      `/api/leads/${lead.id}/${kind}`,
      'POST',
      kind === 'notes'
        ? { body: f.get('body') }
        : { title: f.get('title'), dueAt: brasiliaInput(String(f.get('dueAt') ?? '')) },
    ).then((ok) => {
      if (ok) form.reset();
    });
  };
  const person = (id: string) => catalog.team.find((u) => u.id === id)?.name ?? 'Membro do time';
  const stage = catalog.stages.find((s) => s.key === lead.stageKey)?.label;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{lead.name}</h1>
          <p className="mt-1 text-sm text-ink2">
            {stage} · {lead.tier} · SDR {lead.sdr.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.phone && (
            <a
              className={quietButton}
              href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          )}
          {lead.instagram && <span className="px-3 py-2 text-sm text-ink2">@{lead.instagram}</span>}
        </div>
      </div>
      <FormError message={error} />
      <div className="glass-card flex flex-wrap items-end gap-3 p-4">
        <Field label="Mover para">
          <select
            id="move-stage"
            className={control}
            defaultValue={lead.stageKey}
            onChange={(e) =>
              void mutate(`/api/leads/${lead.id}`, 'PATCH', {
                version: lead.version,
                stageKey: e.target.value,
              })
            }
            disabled={busy}
          >
            {catalog.stages.map((s) => (
              <option key={s.id} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <span className="pb-3 text-xs text-ink2">
          Próximo contato: {lead.nextContactAt ? date(lead.nextContactAt) : 'sem data'}
        </span>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="glass-card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold">Notas</h2>
          {activity.notes.length === 0 && <p className="text-sm text-ink2">Nenhuma nota ainda.</p>}
          {activity.notes.map((n) => (
            <article key={n.id} className="border-b border-line pb-3">
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <p className="mt-1 text-xs text-ink2">
                {person(n.createdBy)} · {date(n.createdAt)}
              </p>
            </article>
          ))}
          <form onSubmit={add('notes')} className="flex flex-col gap-3">
            <Field label="Nova nota">
              <textarea
                name="body"
                className={`${control} min-h-24 py-3`}
                maxLength={5000}
                required
              />
            </Field>
            <button className={`${button} self-start`} disabled={busy}>
              Adicionar nota
            </button>
          </form>
        </section>
        <section className="glass-card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold">Tarefas</h2>
          {activity.tasks.length === 0 && (
            <p className="text-sm text-ink2">Nenhuma tarefa ainda.</p>
          )}
          {activity.tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 border-b border-line pb-3"
            >
              <div>
                <p className={`text-sm ${t.completedAt ? 'line-through text-ink2' : ''}`}>
                  {t.title}
                </p>
                {t.dueAt && <small className="text-xs text-ink2">{date(t.dueAt)}</small>}
              </div>
              <button
                className={quietButton}
                disabled={busy}
                aria-label={`${t.completedAt ? 'Reabrir' : 'Concluir'} ${t.title}`}
                onClick={() =>
                  void mutate(`/api/leads/${lead.id}/tasks/${t.id}`, 'PATCH', {
                    version: t.version,
                    completed: !t.completedAt,
                  })
                }
              >
                {t.completedAt ? 'Reabrir' : 'Concluir'}
              </button>
            </div>
          ))}
          <form onSubmit={add('tasks')} className="flex flex-col gap-3">
            <Field label="Nova tarefa">
              <input name="title" className={control} maxLength={200} required />
            </Field>
            <Field label="Vencimento (Brasília)">
              <input name="dueAt" type="datetime-local" className={control} />
            </Field>
            <button className={`${button} self-start`} disabled={busy}>
              Adicionar tarefa
            </button>
          </form>
        </section>
        <section className="glass-card flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold">Reuniões</h2>
          {meetings.length === 0 && <p className="text-sm text-ink2">Nenhuma reunião agendada.</p>}
          {meetings.map((m) => (
            <article key={m.id} className="flex flex-col gap-3 border-b border-line pb-4">
              <p className="text-sm font-semibold">
                {date(m.scheduledAt)} · {person(m.closerId)}
              </p>
              <p className="text-xs text-ink2">
                {m.canceledAt
                  ? 'Cancelada'
                  : m.outcome === 'DONE'
                    ? 'Realizada'
                    : m.outcome === 'NO_SHOW'
                      ? 'No-show'
                      : 'Agendada'}
              </p>
              {!m.canceledAt && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={quietButton}
                      disabled={busy}
                      onClick={() =>
                        void mutate(`/api/meetings/${m.id}/outcome`, 'POST', {
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
                        void mutate(`/api/meetings/${m.id}/outcome`, 'POST', {
                          version: m.version,
                          outcome: 'NO_SHOW',
                        })
                      }
                    >
                      No-show
                    </button>
                    <button
                      className={quietButton}
                      disabled={busy}
                      onClick={() =>
                        void mutate(`/api/meetings/${m.id}/cancel`, 'POST', { version: m.version })
                      }
                    >
                      Cancelar reunião
                    </button>
                  </div>
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void mutate(`/api/meetings/${m.id}`, 'PATCH', {
                        version: m.version,
                        scheduledAt: brasiliaInput(String(f.get('scheduledAt') ?? '')),
                      });
                    }}
                  >
                    <Field label="Novo horário (Brasília)">
                      <input
                        name="scheduledAt"
                        type="datetime-local"
                        className={control}
                        required
                      />
                    </Field>
                    <button disabled={busy} className={`${quietButton} self-start`}>
                      Reagendar
                    </button>
                  </form>
                  {me.role === 'HEAD' && (
                    <Field label="Reatribuir closer">
                      <select
                        className={control}
                        defaultValue={m.closerId}
                        disabled={busy}
                        onChange={(e) =>
                          void mutate(`/api/meetings/${m.id}`, 'PATCH', {
                            version: m.version,
                            closerId: e.target.value,
                          })
                        }
                      >
                        {catalog.team
                          .filter((u) => u.canClose)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                </>
              )}
            </article>
          ))}
          {me.role !== 'CLOSER' && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void mutate('/api/meetings', 'POST', {
                  leadId: lead.id,
                  closerId: f.get('closerId'),
                  scheduledAt: brasiliaInput(String(f.get('scheduledAt') ?? '')),
                  origin: f.get('origin'),
                });
              }}
            >
              <Field label="Closer da reunião">
                <select
                  name="closerId"
                  className={control}
                  required
                  defaultValue={lead.closer?.id ?? ''}
                >
                  <option value="" disabled>
                    Escolha
                  </option>
                  {catalog.team
                    .filter((u) => u.canClose)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Horário da reunião (Brasília)">
                <input name="scheduledAt" type="datetime-local" className={control} required />
              </Field>
              <Field label="Origem do agendamento">
                <select name="origin" className={control}>
                  <option value="DIRETO">Direto</option>
                  <option value="FOLLOW">Follow-up</option>
                </select>
              </Field>
              <button disabled={busy} className={`${button} self-start`}>
                Agendar reunião
              </button>
            </form>
          )}
        </section>
        <section className="glass-card p-5">
          <h2 className="mb-4 text-lg font-bold">Histórico</h2>
          <ol className="flex flex-col gap-4">
            {activity.timeline.map((t) => (
              <li key={t.id} className="border-l-2 border-line pl-3">
                <p className="text-sm">{EVENT_LABEL[t.kind] ?? 'Registro atualizado'}</p>
                <p className="mt-1 text-xs text-ink2">
                  {person(t.actorId)} · {date(t.at)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {me.role !== 'CLOSER' && (
        <details className="glass-card p-5">
          <summary className="cursor-pointer font-semibold">Editar dados do lead</summary>
          <div className="mt-5">
            <LeadForm lead={lead} catalog={catalog} me={me} />
          </div>
        </details>
      )}
      {me.role === 'HEAD' && (
        <details className="glass-card p-5">
          <summary className="cursor-pointer text-sm text-danger">Excluir lead</summary>
          <p className="my-3 text-sm text-ink2">
            O lead será retirado das listas e o histórico ficará preservado.
          </p>
          <button
            disabled={busy}
            className={quietButton}
            onClick={async () => {
              setBusy(true);
              try {
                await clientApi(`/api/leads/${lead.id}`, 'DELETE', { version: lead.version });
                router.push('/leads');
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar exclusão
          </button>
        </details>
      )}
    </div>
  );
}
