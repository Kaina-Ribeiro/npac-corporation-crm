'use client';
import type { LeadCatalog, MeetingDTO } from '@npac/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { brasiliaInput, clientApi } from '@/lib/client-api';
import { closeWithMotion } from '@/lib/dialog-motion';
import { toBrasiliaInput } from '@/lib/stage-fields';
import { button, control, Field, FormError, quietButton } from './crm-ui';
import { showToast } from './toast';

/** Tarefa de um lead que vai ser concluída. */
export type TaskToComplete = {
  id: string;
  leadId: string;
  leadName: string;
  title: string;
  dueAt: string | null;
  version: number;
};

/** Próximo passo (NPAC-67, palavras do Igor de 23/11/2026). */
const NEXT_STEPS = [
  { key: 'MEETING', label: 'Agendou reunião' },
  { key: 'FOLLOW_UP', label: 'Novo follow-up' },
  { key: 'CALL', label: 'Ligar para a pessoa' },
] as const;
type Next = (typeof NEXT_STEPS)[number]['key'];
const AT_LABEL: Record<Next, string> = {
  MEETING: 'Data e hora da reunião (Brasília)',
  FOLLOW_UP: 'Nova data de contato (Brasília)',
  CALL: 'Data e hora da ligação (Brasília)',
};

/** "sex., 27/11, 18:00": a reunião já marcada (NPAC-81). */
const meetingWhen = (at: string) =>
  new Date(at).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
/** Valor do rádio para marcar outra reunião em vez de usar a que existe. */
const NEW_MEETING = 'new';

const due = (at: string) =>
  new Date(at).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Concluir a tarefa de um lead (NPAC-67, opção A do Gabriel): pede o que aconteceu (vira nota da
 * ficha) e o próximo passo, para o lead nunca ficar sem próxima ação. No Hoje (círculo) e nas
 * Tarefas da ficha; quem não edita o lead (closer) conclui direto, como antes. Uma chamada só:
 * a API conclui, anota e aplica o próximo passo na mesma transação.
 */
export function TaskCompleteDialog({
  task,
  team,
  defaultCloserId,
  onSaved,
  onClose,
}: {
  task: TaskToComplete;
  team: LeadCatalog['team'];
  /** Closer já ligado ao lead (ficha); no Hoje a pessoa escolhe. */
  defaultCloserId?: string | null;
  /** Salvou: quem abriu recarrega os dados. */
  onSaved: () => void;
  /** Fechou (salvou ou cancelou); quem abriu desmonta a janelinha. */
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [next, setNext] = useState<Next | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => new Date().toISOString());
  /** NPAC-81: reuniões do lead em aberto (null = buscando). Com alguma, a escolha começa nela. */
  const [openMeetings, setOpenMeetings] = useState<MeetingDTO[] | null>(null);
  const [meetingChoice, setMeetingChoice] = useState<string>(NEW_MEETING);
  useEffect(() => {
    ref.current?.showModal();
    let alive = true;
    clientApi<MeetingDTO[]>(`/api/meetings?leadId=${task.leadId}`)
      .then((ms) => {
        if (!alive) return;
        const open = ms
          .filter(
            (m) => !m.canceledAt && !m.outcome && new Date(m.scheduledAt).getTime() > Date.now(),
          )
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
        setOpenMeetings(open);
        if (open[0]) setMeetingChoice(open[0].id);
      })
      .catch(() => alive && setOpenMeetings([]));
    return () => {
      alive = false;
    };
    // Só ao abrir: a janelinha é montada para uma tarefa.
  }, []);
  const useExisting = next === 'MEETING' && meetingChoice !== NEW_MEETING;
  const late = task.dueAt !== null && new Date(task.dueAt).getTime() < new Date(now).getTime();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!next) {
      setError('Escolha o próximo passo.');
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const note = String(f.get('note') ?? '');
      await clientApi(
        `/api/leads/${task.leadId}/tasks/${task.id}/complete`,
        'POST',
        useExisting
          ? { version: task.version, note, next, meetingId: meetingChoice }
          : {
              version: task.version,
              note,
              next,
              at: brasiliaInput(String(f.get('at') ?? '')),
              ...(next === 'MEETING' ? { closerId: f.get('closerId') } : {}),
            },
      );
      showToast();
      onSaved();
      closeWithMotion(ref.current, onClose);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        closeWithMotion(ref.current, onClose);
      }}
      data-own-motion
      className="dlg m-auto w-[min(480px,calc(100vw-32px))] rounded-3xl bg-[var(--bg)] p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-bold tracking-[-0.02em]">
          Concluir tarefa
        </h2>
        <div className="flex items-center gap-3 rounded-2xl bg-black/[.04] px-3.5 py-3 dark:bg-white/[.06]">
          <span
            aria-hidden="true"
            className={`size-2 flex-none rounded-full ${late ? 'bg-danger' : 'bg-ink3'}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold break-words">{task.title}</p>
            <p className="text-xs break-words text-ink2">
              <span className="mr-1.5 inline-block rounded-md bg-black/5 px-1.5 leading-[18px] font-semibold dark:bg-white/10">
                Tarefa
              </span>
              {task.leadName}
              {task.dueAt && (
                <>
                  {' · '}
                  <span className={late ? 'text-danger' : ''}>
                    {late ? 'venceu' : 'vence'} {due(task.dueAt)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <Field label="O que aconteceu">
          <textarea
            name="note"
            rows={3}
            maxLength={5000}
            required
            className={`${control} min-h-24 resize-none py-3`}
          />
        </Field>
        <fieldset className="flex min-w-0 flex-col">
          <legend className="mb-2 text-sm font-semibold text-ink2">Próximo passo</legend>
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-black/[.06] p-1 dark:bg-white/[.08]">
            {NEXT_STEPS.map((o) => (
              // Destaque pelo estado do React: `:has(:checked)` às vezes não redesenha no Chrome.
              <label
                key={o.key}
                className={`grid min-h-11 cursor-pointer place-items-center rounded-xl px-2 py-1.5 text-center text-[13px] leading-tight font-semibold transition-[background,color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--gold-ring)] ${
                  next === o.key
                    ? 'bg-[var(--bg)] text-ink shadow-[0_1px_2px_rgba(0,0,0,.12),0_0_0_0.5px_rgba(0,0,0,.06)] dark:bg-white/15'
                    : 'text-ink2 hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="next"
                  value={o.key}
                  className="sr-only"
                  checked={next === o.key}
                  onChange={() => {
                    setNext(o.key);
                    setError('');
                  }}
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {next === 'MEETING' && openMeetings && openMeetings.length > 0 && (
          <fieldset className="flex min-w-0 flex-col">
            <legend className="mb-2 text-sm font-semibold text-ink2">
              {openMeetings.length > 1 ? 'Reuniões já marcadas' : 'Reunião já marcada'}
            </legend>
            <div className="flex flex-col gap-1.5">
              {[
                ...openMeetings.map((m) => ({
                  value: m.id,
                  label: meetingWhen(m.scheduledAt),
                  hint: team.find((u) => u.id === m.closerId)?.name ?? 'Closer',
                })),
                { value: NEW_MEETING, label: 'Marcar outra reunião', hint: '' },
              ].map((o) => (
                <label
                  key={o.value}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition-[background,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--gold-ring)] ${
                    meetingChoice === o.value
                      ? 'bg-[var(--bg)] shadow-[0_0_0_1.5px_var(--gold-deep)]'
                      : 'bg-black/[.04] hover:bg-black/[.07] dark:bg-white/[.06] dark:hover:bg-white/[.1]'
                  }`}
                >
                  <input
                    type="radio"
                    name="meetingChoice"
                    value={o.value}
                    checked={meetingChoice === o.value}
                    onChange={() => {
                      setMeetingChoice(o.value);
                      setError('');
                    }}
                    className="size-4 flex-none accent-[var(--gold-deep)]"
                  />
                  <span className="min-w-0 flex-1 font-semibold first-letter:uppercase">
                    {o.label}
                  </span>
                  {o.hint && <span className="text-ink2">{o.hint}</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {next === 'MEETING' && openMeetings === null && (
          <p className="text-sm text-ink2" role="status">
            Procurando reunião marcada…
          </p>
        )}
        {next && !useExisting && (next !== 'MEETING' || openMeetings !== null) && (
          <div key={next} className={`grid gap-3 ${next === 'MEETING' ? 'sm:grid-cols-2' : ''}`}>
            <Field label={AT_LABEL[next]}>
              <input
                name="at"
                type="datetime-local"
                required
                min={toBrasiliaInput(now)}
                className={control}
              />
            </Field>
            {next === 'MEETING' && (
              <Field label="Closer da reunião">
                <select
                  name="closerId"
                  className={control}
                  required
                  defaultValue={
                    team.some((u) => u.id === defaultCloserId && u.canClose)
                      ? (defaultCloserId ?? '')
                      : ''
                  }
                >
                  <option value="" disabled>
                    Escolha o closer
                  </option>
                  {team
                    .filter((u) => u.canClose)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
        )}
        <FormError message={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={quietButton}
            onClick={() => closeWithMotion(ref.current, onClose)}
          >
            Cancelar
          </button>
          <button className={button} disabled={busy}>
            {busy ? 'Salvando…' : 'Concluir'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
