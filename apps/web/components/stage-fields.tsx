'use client';
import type { LeadCatalog, LeadDTO, ProductDTO, Role } from '@npac/shared';
import { LOST_REASON_LABELS, LOST_REASON_OTHER_MAX, LOST_REASONS } from '@npac/shared/enums';
import { money } from '@npac/shared/money';
import { useState } from 'react';
import {
  centsInput,
  nextContactLabel,
  SF,
  stageFieldsKind,
  toBrasiliaInput,
} from '@/lib/stage-fields';
import { control, Field } from './crm-ui';

export type StageFieldsLead = Partial<
  Pick<
    LeadDTO,
    | 'nextContactAt'
    | 'closer'
    | 'paymentProductId'
    | 'paymentAmountCents'
    | 'lostReason'
    | 'lostReasonOther'
  >
>;

/** Reunião futura, não cancelada e sem resultado: o Agendado não pede outra. */
export type OpenMeeting = { scheduledAt: string; closerName: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** "Reunião marcada: 12/11, 15:00 com Sônia". */
export const openMeetingText = (m: OpenMeeting) =>
  `Reunião marcada: ${when(m.scheduledAt)} com ${m.closerName}`;

/**
 * Campos que a etapa pede (NPAC-38), um componente só para cadastro, ficha e janelinhas:
 * Agendados → reunião + closer · Agendou Pagamento → data + produto + valor · No-Show → tentar
 * remarcar em · Sem Perfil → motivo (+ texto no Outro) · demais → próximo contato.
 * Devolve `Field`s soltos para caber na grade de quem usa; `readStageFields` lê os valores.
 */
export function StageFields({
  stage,
  changed,
  openMeeting,
  team,
  products,
  role,
  lead,
}: {
  stage: string;
  /** A etapa vai mudar (ou é o cadastro): só então a reunião é pedida. */
  changed: boolean;
  openMeeting?: OpenMeeting | null;
  team: LeadCatalog['team'];
  products: ProductDTO[];
  role: Role;
  lead?: StageFieldsLead;
}) {
  const kind = stageFieldsKind(stage);
  // Valores atuais só valem na própria etapa (ao sair, a API apaga pagamento e motivo).
  const keep = !changed;
  const [productId, setProductId] = useState(keep ? (lead?.paymentProductId ?? '') : '');
  const [amount, setAmount] = useState(
    keep && lead?.paymentAmountCents ? centsInput(lead.paymentAmountCents) : '',
  );
  const [reason, setReason] = useState<string>(keep ? (lead?.lostReason ?? '') : '');

  if (kind === 'MEETING') {
    // Lead que já está no Agendado: a reunião se cuida na seção Reuniões da ficha.
    if (!changed) return null;
    if (openMeeting)
      return (
        <p className="self-end pb-3 text-sm text-ink2" role="status">
          {openMeetingText(openMeeting)}
        </p>
      );
    if (role === 'CLOSER')
      return (
        <p className="self-end pb-3 text-sm text-ink2" role="status">
          A reunião é agendada pelo SDR ou pela liderança.
        </p>
      );
    return (
      <>
        <Field label="Data e hora da reunião (Brasília)">
          <input name={SF.meetingAt} type="datetime-local" className={control} required />
        </Field>
        <Field label="Closer da reunião">
          <select
            name={SF.meetingCloser}
            className={control}
            required
            defaultValue={lead?.closer?.id ?? ''}
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
      </>
    );
  }

  if (kind === 'PAYMENT') {
    return (
      <>
        <Field label="Data combinada do pagamento (Brasília)">
          <input
            name={SF.next}
            type="datetime-local"
            className={control}
            required={changed}
            defaultValue={keep ? toBrasiliaInput(lead?.nextContactAt) : ''}
          />
        </Field>
        <Field label="Produto">
          <select
            name={SF.product}
            className={control}
            required={changed}
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              const p = products.find((x) => x.id === e.target.value);
              // O valor começa com o preço do produto e pode ser editado.
              if (p) setAmount(centsInput(p.priceCents));
            }}
          >
            <option value="" disabled={changed}>
              Escolha o produto
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.closerName} — {money(p.priceCents)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor combinado (R$)">
          <input
            name={SF.amount}
            className={control}
            required={changed || Boolean(productId)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            pattern="\d+([.,]\d{1,2})?"
            title="Use números com até duas casas decimais, ex.: 1500,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </>
    );
  }

  if (kind === 'REASON')
    return (
      <>
        <Field label="Motivo">
          <select
            name={SF.reason}
            className={control}
            required={changed}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="" disabled={changed}>
              Escolha o motivo
            </option>
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>
                {LOST_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        {reason === 'OUTRO' && (
          <Field label="Qual motivo?">
            <input
              name={SF.reasonOther}
              className={control}
              required
              maxLength={LOST_REASON_OTHER_MAX}
              autoComplete="off"
              placeholder="Escreva o motivo"
              defaultValue={keep ? (lead?.lostReasonOther ?? '') : ''}
              autoFocus={changed || lead?.lostReason !== 'OUTRO'}
            />
          </Field>
        )}
      </>
    );

  return (
    <Field label={`${nextContactLabel(stage)} (Brasília)`}>
      <input
        name={SF.next}
        type="datetime-local"
        className={control}
        defaultValue={toBrasiliaInput(lead?.nextContactAt)}
      />
    </Field>
  );
}
