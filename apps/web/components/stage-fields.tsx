'use client';
import type { LeadCatalog, LeadDTO, ProductDTO, Role } from '@npac/shared';
import { LOST_REASON_LABELS, LOST_REASON_OTHER_MAX, LOST_REASONS } from '@npac/shared/enums';
import { money, parseCents } from '@npac/shared/money';
import { useState, type ReactNode } from 'react';
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
    | 'stageKey'
    | 'nextContactAt'
    | 'closer'
    | 'paymentProductId'
    | 'paymentAmountCents'
    | 'paymentEntryCents'
    | 'paymentEntryPaid'
    | 'paymentToComplete'
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
 * Agendados → reunião + closer · Agendou Pagamento → data + produto + valor (SDR: produto + closer)
 * · No-Show → tentar remarcar em · Sem Perfil → motivo (+ texto no Outro) · demais → próximo contato.
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

  if (kind === 'PAYMENT' && role === 'SDR')
    return <SdrPaymentFields changed={changed} lead={lead} team={team} products={products} />;

  if (kind === 'PAYMENT') {
    return (
      <PaymentValueFields
        amount={amount}
        setAmount={setAmount}
        required={changed}
        keep={keep}
        lead={lead}
      >
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
              if (p) setAmount(centsInput(p.priceCents ?? 0));
            }}
          >
            <option value="" disabled={changed}>
              Escolha o produto
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.closerName} — {money(p.priceCents ?? 0)}
              </option>
            ))}
          </select>
        </Field>
      </PaymentValueFields>
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
        // Saindo de Agendou Pagamento, a data combinada não vira próximo contato (item 13).
        defaultValue={
          changed && lead?.stageKey === 'AGENDOU_PAGAMENTO'
            ? ''
            : toBrasiliaInput(lead?.nextContactAt)
        }
      />
    </Field>
  );
}

/**
 * Valor, data e entrada de Agendou Pagamento: closer e liderança (item 13). `children` entra entre
 * a data e o valor (o seletor de produto). `required`: a etapa muda, ou o closer está completando.
 */
export function PaymentValueFields({
  amount,
  setAmount,
  required,
  keep,
  lead,
  children,
}: {
  amount: string;
  setAmount: (value: string) => void;
  required: boolean;
  /** Valores atuais só valem na própria etapa. */
  keep: boolean;
  lead?: StageFieldsLead;
  children?: ReactNode;
}) {
  // Pagamento parcial (NPAC-41): já pagou uma entrada; o restante vence na data combinada.
  const [partial, setPartial] = useState(
    keep && Boolean(lead?.paymentEntryCents || lead?.paymentEntryPaid),
  );
  const [entry, setEntry] = useState(
    keep && lead?.paymentEntryCents ? centsInput(lead.paymentEntryCents) : '',
  );
  const rest = (() => {
    try {
      const v = parseCents(amount) - parseCents(entry);
      return amount && entry && v > 0 ? v : null;
    } catch {
      return null;
    }
  })();
  return (
    <>
      <EntryPaidCheckbox
        checked={partial}
        onChange={setPartial}
        hint="Pagamento parcial: o restante fica para a data combinada."
      />
      <Field
        label={
          partial
            ? 'Data combinada para o restante (Brasília)'
            : 'Data combinada do pagamento (Brasília)'
        }
      >
        <input
          name={SF.next}
          type="datetime-local"
          className={control}
          required={required}
          defaultValue={keep ? toBrasiliaInput(lead?.nextContactAt) : ''}
        />
      </Field>
      {children}
      <Field label="Valor combinado (R$)">
        <input
          name={SF.amount}
          className={control}
          required={required}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          pattern="\d+([.,]\d{1,2})?"
          title="Use números com até duas casas decimais, ex.: 1500,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      {partial && (
        <Field label="Entrada já paga (R$)">
          <input
            name={SF.entry}
            className={control}
            required={required || Boolean(amount)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            pattern="\d+([.,]\d{1,2})?"
            title="Use números com até duas casas decimais, ex.: 500,00"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
          />
        </Field>
      )}
      {partial && rest !== null && (
        <p className="self-end pb-3 text-sm text-ink2" aria-live="polite">
          Restante: <strong className="text-ink">{money(rest)}</strong>
        </p>
      )}
    </>
  );
}

function EntryPaidCheckbox({
  checked,
  onChange,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint: string;
}) {
  return (
    <label className="col-span-full flex cursor-pointer items-center gap-3 py-2">
      <input
        type="checkbox"
        name={SF.partial}
        className="size-5 accent-[var(--gold-deep)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col">
        <span className="text-sm font-semibold">Já pagou uma entrada</span>
        <span className="text-xs text-ink2">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Agendou Pagamento pelo SDR (item 13, 2A): a caixa, o produto sem R$ e o closer, que vem do
 * produto e pode ser trocado. Depois que o closer completou, o SDR só acompanha (a API recusa).
 */
function SdrPaymentFields({
  changed,
  lead,
  team,
  products,
}: {
  changed: boolean;
  lead?: StageFieldsLead;
  team: LeadCatalog['team'];
  products: ProductDTO[];
}) {
  const keep = !changed;
  const [productId, setProductId] = useState(keep ? (lead?.paymentProductId ?? '') : '');
  const [closerId, setCloserId] = useState(keep ? (lead?.closer?.id ?? '') : '');
  const [paid, setPaid] = useState(keep && Boolean(lead?.paymentEntryPaid));
  if (keep && lead?.paymentProductId && !lead.paymentToComplete)
    return (
      <p className="self-end pb-3 text-sm text-ink2" role="status">
        O closer já completou este pagamento.
      </p>
    );
  return (
    <>
      <EntryPaidCheckbox
        checked={paid}
        onChange={setPaid}
        hint="O closer informa os valores e a data."
      />
      <Field label="Produto">
        <select
          name={SF.product}
          className={control}
          required={changed}
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            const p = products.find((x) => x.id === e.target.value);
            if (p) setCloserId(p.closerId);
          }}
        >
          <option value="" disabled={changed}>
            Escolha o produto
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.closerName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Closer">
        <select
          name={SF.closer}
          className={control}
          required={changed || Boolean(productId)}
          value={closerId}
          onChange={(e) => setCloserId(e.target.value)}
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
