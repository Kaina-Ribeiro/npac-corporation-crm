'use client';
import type { ProductDTO } from '@npac/shared';
import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, Field, FormError, quietButton } from './crm-ui';
import { showToast } from './toast';

/**
 * Marcar venda (NPAC-48, Igor 17/11/2026): depois da reunião realizada, o SDR escolhe só o produto
 * vendido, sem valor. O lead vai para Venda como "venda a registrar" e o closer da reunião recebe
 * o aviso para pôr o valor. Os produtos são os do closer da reunião (o closer da venda).
 */
export function SaleMark({
  leadId,
  version,
  closerName,
  products,
  onDone,
}: {
  leadId: string;
  version: number;
  closerName: string;
  products: ProductDTO[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const productId = String(new FormData(e.currentTarget).get('productId') ?? '');
    if (!productId) {
      setError('Escolha o produto vendido.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await clientApi(`/api/leads/${leadId}/sale-mark`, 'POST', { version, productId });
      showToast();
      setOpen(false);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button type="button" className={`${button} self-start`} onClick={() => setOpen(true)}>
        Marcar venda
      </button>
    );
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-2xl border border-line p-4"
      aria-label="Marcar venda"
    >
      <Field label="Produto vendido">
        <select name="productId" className={control} defaultValue="" required autoFocus>
          <option value="" disabled>
            Escolha o produto
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-ink2">
        O lead vai para Venda e {closerName} recebe o aviso para registrar o valor.
      </p>
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || !products.length}>
          {busy ? 'Salvando…' : 'Marcar venda'}
        </button>
        <button
          type="button"
          className={quietButton}
          onClick={() => {
            setOpen(false);
            setError('');
          }}
        >
          Cancelar
        </button>
      </div>
      {!products.length && (
        <p className="text-xs text-ink2">
          {closerName} não tem produto ativo no catálogo. Peça à liderança.
        </p>
      )}
    </form>
  );
}
