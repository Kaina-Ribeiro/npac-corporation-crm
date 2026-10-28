'use client';
import type { LeadDTO, ProductDTO, Role } from '@npac/shared';
import { money, parseCents } from '@npac/shared/money';
import { useState, type FormEvent } from 'react';
import { brasiliaInput, clientApi } from '@/lib/client-api';
import { button, control, Field, FormError, quietButton } from './crm-ui';

export function SaleFlow({
  lead,
  products,
  me,
  done,
}: {
  lead: LeadDTO;
  products: ProductDTO[];
  me: { id: string; role: Role };
  done: () => void;
}) {
  const [version] = useState(lead.version);
  const [key] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState(0),
    [productId, setProductId] = useState(''),
    [total, setTotal] = useState(''),
    [method, setMethod] = useState('PIX'),
    [entry, setEntry] = useState('0');
  const [parts, setParts] = useState([{ amount: '', due: '' }]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const product = products.find((p) => p.id === productId);
  const deferred = method === 'PARTIAL' || method === 'BANK_SLIP';
  function payload() {
    if (!product) throw new Error('Escolha um produto.');
    const totalCents = parseCents(total);
    const entryCents = method === 'PARTIAL' ? parseCents(entry) : 0;
    const installments = deferred
      ? parts.map((p) => ({ amountCents: parseCents(p.amount), dueAt: brasiliaInput(p.due) }))
      : [];
    if (
      totalCents <= 0 ||
      installments.some(
        (p) => p.amountCents <= 0 || !p.dueAt || new Date(p.dueAt).getTime() <= Date.now(),
      ) ||
      (method === 'PARTIAL' && (entryCents <= 0 || entryCents >= totalCents)) ||
      (deferred && entryCents + installments.reduce((a, p) => a + p.amountCents, 0) !== totalCents)
    )
      throw new Error('Entrada e parcelas precisam fechar o valor total.');
    return {
      leadId: lead.id,
      productId,
      closerId: product.closerId,
      version,
      totalCents,
      method,
      entryCents,
      installments,
      requestKey: key,
    };
  }
  function next(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (step === 0 && !product) throw new Error('Escolha o produto.');
      if (step === 1) payload();
      setStep(step + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save() {
    setError('');
    setBusy(true);
    try {
      await clientApi('/api/finance/deals', 'POST', payload());
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={next} className="flex flex-col gap-4" aria-label="Registrar venda">
      <p className="text-sm text-ink2">
        {['Produto e closer', 'Pagamento', 'Confirmar venda'][step]} · {step + 1} de 3
      </p>
      {step === 0 && (
        <>
          <Field label="Produto da venda">
            <select
              className={control}
              value={productId}
              required
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((p) => p.id === e.target.value);
                if (p) setTotal((p.priceCents / 100).toFixed(2));
              }}
            >
              <option value="">Escolha</option>
              {products
                .filter((p) => me.role !== 'CLOSER' || p.closerId === me.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.closerName} — {money(p.priceCents)}
                  </option>
                ))}
            </select>
          </Field>
          {product && <p className="text-sm">Closer: {product.closerName}</p>}
        </>
      )}
      {step === 1 && (
        <>
          <Field label="Valor total (R$)">
            <input
              className={control}
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              required
            />
          </Field>
          <Field label="Forma de pagamento">
            <select className={control} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="PIX">Pix</option>
              <option value="CARD">Cartão</option>
              <option value="BANK_SLIP">Boleto parcelado</option>
              <option value="PARTIAL">Parcial — entrada e saldo</option>
            </select>
          </Field>
          {method === 'PARTIAL' && (
            <Field label="Entrada recebida (R$)">
              <input
                className={control}
                inputMode="decimal"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                required
              />
            </Field>
          )}
          {deferred && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm font-semibold">Parcelas a receber</legend>
              {parts.map((p, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-2">
                  <Field label={`Parcela ${i + 1} (R$)`}>
                    <input
                      className={control}
                      inputMode="decimal"
                      value={p.amount}
                      onChange={(e) =>
                        setParts(
                          parts.map((v, n) => (n === i ? { ...v, amount: e.target.value } : v)),
                        )
                      }
                      required
                    />
                  </Field>
                  <Field label={`Vencimento ${i + 1} (Brasília)`}>
                    <input
                      type="datetime-local"
                      className={control}
                      value={p.due}
                      onChange={(e) =>
                        setParts(parts.map((v, n) => (n === i ? { ...v, due: e.target.value } : v)))
                      }
                      required
                    />
                  </Field>
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  className={quietButton}
                  onClick={() => setParts([...parts, { amount: '', due: '' }])}
                  disabled={parts.length >= 120}
                >
                  Adicionar parcela
                </button>
                {parts.length > 1 && (
                  <button
                    type="button"
                    className={quietButton}
                    onClick={() => setParts(parts.slice(0, -1))}
                  >
                    Remover última
                  </button>
                )}
              </div>
            </fieldset>
          )}
        </>
      )}
      {step === 2 && (
        <section className="rounded-2xl border border-line p-4">
          <p className="font-semibold">{product?.name}</p>
          <p className="text-sm text-ink2">{product?.closerName}</p>
          <p className="my-3 text-2xl font-bold text-gold-deep">{money(parseCents(total))}</p>
          <p className="text-sm">
            {deferred
              ? `${parts.length} parcela(s) pendente(s)${method === 'PARTIAL' ? ` e entrada de ${money(parseCents(entry))}` : ''}`
              : 'Recebido integralmente no registro'}
          </p>
        </section>
      )}
      <FormError message={error} />
      <div className="flex gap-2">
        {step > 0 && (
          <button
            type="button"
            className={quietButton}
            onClick={() => setStep(step - 1)}
            disabled={busy}
          >
            Voltar
          </button>
        )}
        {step < 2 ? (
          <button className={button}>Continuar venda</button>
        ) : (
          <button type="button" className={button} disabled={busy} onClick={() => void save()}>
            Confirmar venda
          </button>
        )}
      </div>
    </form>
  );
}
