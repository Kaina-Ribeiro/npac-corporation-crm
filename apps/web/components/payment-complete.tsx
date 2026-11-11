'use client';
import type { LeadDTO, ProductDTO } from '@npac/shared';
import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { centsInput, readStageFields, SF } from '@/lib/stage-fields';
import { button, FormError } from './crm-ui';
import { PaymentValueFields } from './stage-fields';

/**
 * Item 13 do Igor (3A): o SDR informou produto e closer; aqui o closer do lead (ou a liderança)
 * completa valor, data e entrada. O produto vai escondido só para reaproveitar a leitura do
 * formulário: a API não deixa o closer trocá-lo, então ele não segue no corpo.
 */
export function PaymentComplete({
  lead,
  product,
  onDone,
}: {
  lead: LeadDTO;
  product?: ProductDTO;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(product?.priceCents ? centsInput(product.priceCents) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = readStageFields('AGENDOU_PAGAMENTO', new FormData(e.currentTarget), {
        changed: true,
        withMeeting: false,
        role: 'CLOSER',
      });
      delete body.paymentProductId;
      await clientApi(`/api/leads/${lead.id}`, 'PATCH', { version: lead.version, ...body });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Completar pagamento"
      className="glass-card flex flex-col gap-4 p-5"
    >
      <div>
        <h2 className="text-lg font-bold">Completar pagamento</h2>
        <p className="mt-1 text-sm text-ink2">
          O SDR informou {product ? `o produto ${product.name}` : 'o produto'}. Faltam o valor e a
          data combinados.
        </p>
      </div>
      <input type="hidden" name={SF.product} value={lead.paymentProductId ?? ''} />
      <div className="grid items-end gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <PaymentValueFields amount={amount} setAmount={setAmount} required keep lead={lead} />
      </div>
      <FormError message={error} />
      <button className={`${button} self-start`} disabled={busy}>
        {busy ? 'Salvando…' : 'Completar pagamento'}
      </button>
    </form>
  );
}
