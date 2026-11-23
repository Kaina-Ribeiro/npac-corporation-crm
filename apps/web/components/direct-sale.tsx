'use client';
import type { LeadCatalog, ProductDTO } from '@npac/shared';
import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, Field, FormError, quietButton } from './crm-ui';
import { showToast } from './toast';

/**
 * Venda direta (NPAC-65, Igor 23/11/2026, "4.1A, 4.3A, 2.1A"): o SDR vendeu sem reunião, à vista, no
 * cartão ou no boleto. Ele escolhe o closer e o produto, sem valor; o lead vai para Venda como "venda
 * a registrar" e o closer escolhido recebe o aviso para pôr o valor. Não soma reunião realizada.
 */
export function DirectSale({
  leadId,
  version,
  team,
  products,
  defaultCloserId = '',
  onDone,
}: {
  leadId: string;
  version: number;
  team: LeadCatalog['team'];
  products: ProductDTO[];
  defaultCloserId?: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [closerId, setCloserId] = useState(defaultCloserId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closerProducts = products.filter((p) => p.closerId === closerId);
  const closerName = team.find((u) => u.id === closerId)?.name;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const productId = String(new FormData(e.currentTarget).get('productId') ?? '');
    if (!closerId || !productId) {
      setError('Escolha o closer e o produto vendido.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await clientApi(`/api/leads/${leadId}/sale-mark`, 'POST', {
        version,
        productId,
        directSale: { closerId },
      });
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
      <button type="button" className={quietButton} onClick={() => setOpen(true)}>
        Venda direta
      </button>
    );
  return (
    <form
      onSubmit={submit}
      className="grid w-full gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2"
      aria-label="Venda direta"
    >
      <Field label="Closer">
        <select
          className={control}
          required
          autoFocus
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
      <Field label="Produto vendido">
        <select
          key={closerId}
          name="productId"
          className={control}
          required
          defaultValue=""
          disabled={!closerId}
        >
          <option value="" disabled>
            {!closerId
              ? 'Escolha antes o closer'
              : closerProducts.length
                ? 'Escolha o produto'
                : 'Este closer não tem produtos ativos'}
          </option>
          {closerProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="col-span-full text-xs text-ink2">
        Venda sem reunião, à vista, no cartão ou no boleto. O lead vai para Venda e{' '}
        {closerName ?? 'o closer'} recebe o aviso para registrar o valor.
      </p>
      <FormError message={error} />
      <div className="col-span-full flex flex-wrap gap-2">
        <button className={button} disabled={busy}>
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
    </form>
  );
}
