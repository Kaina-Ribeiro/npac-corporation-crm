'use client';
import { isLeader, LOST_REASON_LABELS, TIER_LABELS } from '@npac/shared/enums';
import { money } from '@npac/shared/money';
import { REMINDER_MINUTES } from '@npac/shared/reminders';
import { HandoffActions } from './handoff-actions';
import type {
  DealDTO,
  ProductDTO,
  LeadActivityDTO,
  LeadCatalog,
  LeadDTO,
  MeetingDTO,
  Role,
} from '@npac/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { activityFields } from '@/lib/activity-text';
import { useReminderClock } from '@/lib/alerts';
import { brasiliaInput, clientApi } from '@/lib/client-api';
import {
  nextContactLabel,
  readStageFields,
  stageFieldsKind,
  stageNeedsFields,
} from '@/lib/stage-fields';
import { button, control, Field, FormError, quietButton, StageOptions } from './crm-ui';
import { LeadForm } from './lead-form';
import { StageFields } from './stage-fields';
import { FinancePanel } from './finance-panel';
import { useCrmRefresh } from './shell/live-updates';

const date = (s: string) =>
  new Date(s).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
/** A reunião já começou: dá para registrar se aconteceu ou foi no-show. */
const started = (at: string) => new Date(at).getTime() <= Date.now();
const EVENT_LABEL: Record<string, string> = {
  'lead.created': 'Lead cadastrado',
  'lead.updated': 'Dados atualizados',
  'lead.moved': 'Etapa alterada',
  'lead.reassigned': 'Responsável alterado',
  'lead.called': 'Lead chamado',
  'lead.contact_rescheduled': 'Contato remarcado',
  'note.created': 'Nota adicionada',
  'note.updated': 'Nota atualizada',
  'task.created': 'Tarefa criada',
  'task.updated': 'Tarefa atualizada',
  'meeting.scheduled': 'Reunião agendada',
  'meeting.rescheduled': 'Reunião remarcada',
  'meeting.canceled': 'Reunião cancelada',
  'meeting.outcome': 'Resultado da reunião registrado',
  'meeting.confirmed': 'Confirmação enviada ao lead',
  'sale.registered': 'Venda registrada',
  'sale.pending': 'Venda a registrar (aviso ao closer)',
  'sale.reversed': 'Venda estornada',
  'payment.received': 'Pagamento recebido',
};

/**
 * Liderança vê, por reunião, as etapas de confirmação já vencidas: feitas ou não
 * (NPAC-26: sem alerta extra, só o registro).
 */
function ConfirmationSteps({ meeting: m }: { meeting: MeetingDTO }) {
  const now = useReminderClock([{ scheduledAt: m.scheduledAt }]);
  const at = new Date(m.scheduledAt).getTime();
  const steps =
    now === null
      ? []
      : (['H1', 'M15'] as const).filter((s) => now >= at - REMINDER_MINUTES[s] * 60_000);
  if (!steps.length) return null;
  return (
    <p className="flex flex-wrap gap-1.5 text-xs" aria-label="Confirmações ao lead">
      {steps.map((s) => {
        const ok = m.confirmations.includes(s);
        return (
          <span
            key={s}
            className={`rounded-full px-2 py-0.5 font-medium ${
              ok ? 'bg-black/5 text-ink2 dark:bg-white/10' : 'bg-danger/10 text-danger'
            }`}
          >
            {s === 'H1' ? '1 h' : '15 min'}: {ok ? 'confirmada' : 'não confirmada'}
          </span>
        );
      })}
    </p>
  );
}

export function LeadDetail({
  lead,
  activity,
  catalog,
  meetings,
  deals,
  products,
  me,
}: {
  lead: LeadDTO;
  activity: LeadActivityDTO;
  catalog: LeadCatalog;
  meetings: MeetingDTO[];
  /** `null` para quem não vê vendas e pagamentos (SDR). */
  deals: DealDTO[] | null;
  products: ProductDTO[];
  me: { id: string; role: Role };
}) {
  const router = useRouter();
  useCrmRefresh(() => router.refresh());
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
        : {
            title: f.get('title'),
            dueAt: brasiliaInput(String(f.get('dueAt') ?? '')),
            ...(f.get('assigneeId') ? { assigneeId: f.get('assigneeId') } : {}),
          },
    ).then((ok) => {
      if (ok) form.reset();
    });
  };
  const person = (id: string) => catalog.team.find((u) => u.id === id)?.name ?? 'Membro do time';
  const stage = catalog.stages.find((s) => s.key === lead.stageKey)?.label;
  // "Mover para" uma etapa que pede dados (NPAC-38) mostra os campos antes de salvar.
  const [moveTo, setMoveTo] = useState('');
  const open = meetings.find(
    (m) => !m.canceledAt && !m.outcome && new Date(m.scheduledAt).getTime() > Date.now(),
  );
  const openMeeting = open
    ? { scheduledAt: open.scheduledAt, closerName: person(open.closerId) }
    : null;
  // Closer não agenda reunião (a API recusa): o Agendado só segue com reunião já marcada.
  const moveBlocked = stageFieldsKind(moveTo) === 'MEETING' && !openMeeting && me.role === 'CLOSER';
  const payment = products.find((p) => p.id === lead.paymentProductId);
  // Venda a registrar (NPAC-41): o produto que o SDR informou no cadastro, só o nome.
  const soldProduct = products.find((p) => p.id === lead.soldProductId);
  // Pagamento parcial (NPAC-41): entrada já paga; o restante vence na data combinada.
  const entry = lead.paymentAmountCents ? lead.paymentEntryCents : null;
  function move(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let body;
    try {
      body = readStageFields(moveTo, new FormData(e.currentTarget), {
        changed: true,
        withMeeting: !openMeeting,
      });
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    void mutate(`/api/leads/${lead.id}`, 'PATCH', {
      version: lead.version,
      stageKey: moveTo,
      ...body,
    }).then((ok) => {
      if (ok) setMoveTo('');
    });
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{lead.name}</h1>
          <p className="mt-1 text-sm text-ink2">
            {stage} · {TIER_LABELS[lead.tier]} · SDR {lead.sdr.name}
          </p>
          {lead.saleToRegister && (
            // Cadastrado como Venda Fechada sem a venda (NPAC-39): closer e liderança registram.
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="sale-pending">Venda a registrar</span>
              {soldProduct && (
                <span className="text-sm">
                  Produto: <strong>{soldProduct.name}</strong>
                </span>
              )}
              {deals ? (
                <a className={button} href="#vendas">
                  Registrar venda
                </a>
              ) : (
                <span className="text-xs text-ink2">O closer da reunião registra a venda.</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <HandoffActions leadId={lead.id} />
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
          {lead.instagram && (
            <a
              className={quietButton}
              href={`https://www.instagram.com/${encodeURIComponent(lead.instagram)}/`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Abrir o perfil @${lead.instagram} no Instagram`}
            >
              Instagram
            </a>
          )}
          {lead.instagram && <span className="px-3 py-2 text-sm text-ink2">@{lead.instagram}</span>}
        </div>
      </div>
      <FormError message={error} />
      <form onSubmit={move} className="glass-card flex flex-wrap items-end gap-3 p-4">
        <Field label="Mover para">
          <select
            id="move-stage"
            className={control}
            value={moveTo || lead.stageKey}
            onChange={(e) => {
              const target = e.target.value;
              setError('');
              if (target === lead.stageKey) setMoveTo('');
              else if (stageNeedsFields(target)) setMoveTo(target);
              else {
                setMoveTo('');
                void mutate(`/api/leads/${lead.id}`, 'PATCH', {
                  version: lead.version,
                  stageKey: target,
                });
              }
            }}
            disabled={busy}
          >
            <StageOptions
              stages={catalog.stages}
              current={lead.stageKey}
              incomeUnknown={lead.tier === 'DESCOBRINDO'}
            />
          </select>
        </Field>
        {moveTo ? (
          // Campos da etapa numa grade própria, abaixo do "Mover para" (larguras iguais no celular).
          <div className="grid w-full items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StageFields
              key={moveTo}
              stage={moveTo}
              changed
              openMeeting={openMeeting}
              team={catalog.team}
              products={products}
              role={me.role}
              lead={lead}
            />
            <div className="flex gap-2">
              {!moveBlocked && (
                <button className={button} disabled={busy}>
                  {busy ? 'Salvando…' : 'Mover'}
                </button>
              )}
              <button
                type="button"
                className={quietButton}
                onClick={() => {
                  setMoveTo('');
                  setError('');
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <span className="pb-3 text-xs text-ink2">
            {lead.stageKey === 'PERDIDO' ? (
              <>
                Motivo:{' '}
                {lead.lostReason === 'OUTRO' && lead.lostReasonOther
                  ? lead.lostReasonOther
                  : lead.lostReason
                    ? LOST_REASON_LABELS[lead.lostReason]
                    : 'não informado'}
              </>
            ) : (
              <>
                {entry ? 'Restante combinado para' : nextContactLabel(lead.stageKey)}:{' '}
                {lead.nextContactAt ? date(lead.nextContactAt) : 'sem data'}
                {payment &&
                  lead.paymentAmountCents &&
                  ` · ${payment.name} · ${money(lead.paymentAmountCents)}`}
                {entry &&
                  lead.paymentAmountCents &&
                  ` · entrada de ${money(entry)} paga, faltam ${money(lead.paymentAmountCents - entry)}`}
              </>
            )}
          </span>
        )}
      </form>
      <div className="grid items-start gap-5 lg:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4">
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
                <small className="text-xs text-ink2">
                  {[t.dueAt && date(t.dueAt), t.assigneeId !== me.id && person(t.assigneeId)]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
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
            {isLeader(me.role) && lead.sdr.id !== me.id && (
              <Field label="Responsável">
                <select name="assigneeId" className={control} defaultValue={lead.sdr.id}>
                  <option value={lead.sdr.id}>{lead.sdr.name} (SDR do lead)</option>
                  <option value={me.id}>Eu</option>
                </select>
              </Field>
            )}
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
                      : m.outcome === 'RESCHEDULED'
                        ? 'Remarcada'
                        : 'Agendada'}
              </p>
              {isLeader(me.role) && !m.canceledAt && <ConfirmationSteps meeting={m} />}
              {!m.canceledAt && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {/* Resultado só depois do horário marcado (a API recusa antes); registrado, só a liderança corrige. */}
                    {started(m.scheduledAt) && (!m.outcome || isLeader(me.role)) && (
                      <>
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
                            void mutate(`/api/meetings/${m.id}/outcome`, 'POST', {
                              version: m.version,
                              outcome: 'RESCHEDULED',
                            })
                          }
                        >
                          Remarcado
                        </button>
                      </>
                    )}
                    {/* Com resultado a reunião está encerrada: não cancela, não remarca, não troca closer. */}
                    {!m.outcome && (
                      <button
                        className={quietButton}
                        disabled={busy}
                        onClick={() =>
                          void mutate(`/api/meetings/${m.id}/cancel`, 'POST', {
                            version: m.version,
                          })
                        }
                      >
                        Cancelar reunião
                      </button>
                    )}
                  </div>
                  {!m.outcome && (
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
                  )}
                  {isLeader(me.role) && !m.outcome && (
                    <Field label="Reatribuir closer">
                      <select
                        className={control}
                        value={m.closerId}
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
          {me.role !== 'CLOSER' && lead.tier === 'DESCOBRINDO' && (
            // Só vai para a reunião quando a renda é descoberta (Igor, 10/11/2026).
            <p className="rounded-xl border border-dashed border-ink3/50 p-3 text-sm text-ink2">
              Lead em Descobrindo renda: informe a faixa de renda em “Editar dados do lead” para
              agendar a reunião.
            </p>
          )}
          {me.role !== 'CLOSER' && lead.tier !== 'DESCOBRINDO' && (
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
                <p className="text-sm">
                  {EVENT_LABEL[t.kind] ?? 'Registro atualizado'}
                  {(t.kind === 'lead.updated' || t.kind === 'lead.moved') &&
                    activityFields(t.fields) && (
                      <span className="text-ink2"> · {activityFields(t.fields)}</span>
                    )}
                </p>
                <p className="mt-1 text-xs text-ink2">
                  {person(t.actorId)} · {date(t.at)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {deals && <FinancePanel lead={lead} deals={deals} products={products} me={me} />}
      {me.role !== 'CLOSER' && (
        <details className="glass-card p-5">
          <summary className="cursor-pointer font-semibold">Editar dados do lead</summary>
          <div className="mt-5">
            <LeadForm
              lead={lead}
              catalog={catalog}
              me={me}
              products={products}
              openMeeting={openMeeting}
            />
          </div>
        </details>
      )}
      {isLeader(me.role) && (
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
