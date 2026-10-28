'use client';
import type { DealDTO, LeadDTO, ProductDTO, Role } from '@npac/shared';
import { money } from '@npac/shared/money';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, FormError, quietButton } from './crm-ui';
import { SaleFlow } from './sale-flow';
export function FinancePanel({
  lead,
  deals,
  products,
  me,
}: {
  lead: LeadDTO;
  deals: DealDTO[];
  products: ProductDTO[];
  me: { id: string; role: Role };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const keys = useRef(new Map<string, string>());
  async function act(path: string, body: object) {
    setBusy(true);
    setError('');
    try {
      await clientApi(path, 'POST', body);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass-card flex flex-col gap-4 p-5">
      <h2 className="text-lg font-bold">Vendas e pagamentos</h2>
      <FormError message={error} />
      {deals.map((d) => (
        <article key={d.id} className="flex flex-col gap-3 border-b border-line pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{d.productName}</p>
            <b className="text-gold-deep">{money(d.totalCents)}</b>
          </div>
          <p className="text-sm text-ink2">
            {d.reversedAt ? 'Estornada — histórico preservado' : 'Venda registrada'}
          </p>
          {d.payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {money(p.amountCents)} ·{' '}
                {new Date(p.dueAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ·{' '}
                {p.paidAt ? 'Recebido' : d.reversedAt ? 'Cancelado' : 'A receber'}
              </span>
              {!p.paidAt && !d.reversedAt && (
                <button
                  disabled={busy}
                  className={quietButton}
                  onClick={() => {
                    if (!keys.current.has(p.id)) keys.current.set(p.id, crypto.randomUUID());
                    void act(`/api/finance/payments/${p.id}/receive`, {
                      version: p.version,
                      requestKey: keys.current.get(p.id),
                    });
                  }}
                >
                  Registrar recebimento
                </button>
              )}
            </div>
          ))}
          {me.role === 'HEAD' && !d.reversedAt && (
            <details>
              <summary className="cursor-pointer text-sm text-danger">Estornar venda</summary>
              <p className="my-2 text-xs text-ink2">
                O estorno retira a venda dos totais. Os registros de recebimento ficam preservados.
              </p>
              <button
                className={quietButton}
                disabled={busy}
                onClick={() =>
                  void act(`/api/finance/deals/${d.id}/reverse`, { version: d.version })
                }
              >
                Confirmar estorno
              </button>
            </details>
          )}
        </article>
      ))}
      {!deals.some((d) => !d.reversedAt) && !open && (
        <button className={`${button} self-start`} onClick={() => setOpen(true)}>
          Registrar venda
        </button>
      )}
      {open && (
        <>
          <SaleFlow
            lead={lead}
            products={products}
            me={me}
            done={() => {
              setOpen(false);
              router.refresh();
            }}
          />
          <button className={`${quietButton} self-start`} onClick={() => setOpen(false)}>
            Cancelar registro
          </button>
        </>
      )}
    </section>
  );
}
