'use client';
import type { LeadCatalog, MeetingDTO, ProductDTO, Role } from '@npac/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { closeWithMotion } from '@/lib/dialog-motion';
import { readStageFields, stageFieldsKind, type StageFieldsBody } from '@/lib/stage-fields';
import { button, FormError, quietButton } from './crm-ui';
import { StageFields, type OpenMeeting, type StageFieldsLead } from './stage-fields';

/**
 * Janelinha com os campos da etapa (NPAC-38, 1A): Pipeline (arrastar e seletor), célula da lista e
 * ação em massa (só Sem Perfil, sem `lead`). Cancelar não muda nada: o card fica na etapa antiga.
 * Busca sozinha o que falta: produtos (Agendou Pagamento) e a reunião aberta (Agendados).
 */
export function StageMoveDialog({
  title,
  stage,
  lead,
  team,
  role,
  products: givenProducts,
  onSubmit,
  onClose,
}: {
  title: string;
  stage: string;
  /** Lead que muda de etapa; sem ele (ação em massa) a reunião aberta não é consultada. */
  lead?: StageFieldsLead & { id: string };
  team: LeadCatalog['team'];
  role: Role;
  products?: ProductDTO[];
  /** Salva a mudança com os dados da etapa; erro lançado aparece na janelinha. */
  onSubmit: (body: StageFieldsBody) => Promise<void>;
  /** Fechou (salvou ou cancelou); quem abriu desmonta a janelinha. */
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const kind = stageFieldsKind(stage);
  const [products, setProducts] = useState(givenProducts);
  const [meeting, setMeeting] = useState<OpenMeeting | null | undefined>(
    kind === 'MEETING' && lead ? undefined : null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    if (kind === 'PAYMENT' && !products)
      clientApi<ProductDTO[]>('/api/finance/products')
        .then((p) => alive && setProducts(p))
        .catch((e: Error) => alive && setError(e.message));
    if (kind === 'MEETING' && lead)
      clientApi<MeetingDTO[]>(`/api/meetings?leadId=${lead.id}`)
        .then((ms) => {
          if (!alive) return;
          const open = ms.find(
            (m) => !m.canceledAt && !m.outcome && new Date(m.scheduledAt).getTime() > Date.now(),
          );
          setMeeting(
            open
              ? {
                  scheduledAt: open.scheduledAt,
                  closerName: team.find((u) => u.id === open.closerId)?.name ?? 'o closer',
                }
              : null,
          );
        })
        .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // Só ao abrir: a janelinha é montada para uma mudança.
  }, []);

  const loading = (kind === 'PAYMENT' && !products) || meeting === undefined;
  // Closer não agenda reunião (a API recusa): só segue se o lead já tem uma marcada.
  const blocked = kind === 'MEETING' && !meeting && role === 'CLOSER';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    let body: StageFieldsBody;
    try {
      body = readStageFields(stage, new FormData(e.currentTarget), {
        changed: true,
        withMeeting: !meeting,
        role,
      });
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(body);
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
      // Esc: sai animada e só então avisa quem abriu (sem esperar o evento `close` nativo, que
      // chegaria depois e fecharia a próxima).
      onCancel={(e) => {
        e.preventDefault();
        closeWithMotion(ref.current, onClose);
      }}
      // Fora da entrada em cascata da página (.page-reveal), que deixava a janelinha transparente.
      data-own-motion
      className="dlg m-auto w-[min(460px,calc(100vw-32px))] rounded-3xl bg-[var(--bg)] p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-bold tracking-[-0.02em]">
          {title}
        </h2>
        {loading ? (
          <p className="text-sm text-ink2" role="status">
            Carregando…
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <StageFields
              stage={stage}
              changed
              openMeeting={meeting}
              team={team}
              products={products ?? []}
              role={role}
              lead={lead}
            />
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
          {!blocked && (
            <button className={button} disabled={busy || loading}>
              {busy ? 'Salvando…' : 'Mover'}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
