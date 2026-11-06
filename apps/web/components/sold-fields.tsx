'use client';
import type { LeadCatalog, ProductDTO } from '@npac/shared';
import { money, parseCents } from '@npac/shared/money';
import { useState } from 'react';
import { centsInput, toBrasiliaInput } from '@/lib/stage-fields';
import { deferredMethod, SALE_METHODS, SOLD, spToday } from '@/lib/sold-fields';
import { control, Field, quietButton } from './crm-ui';

const tryCents = (v: string) => {
  try {
    return parseCents(v || '0');
  } catch {
    return null;
  }
};

/**
 * Venda Fechada no cadastro (NPAC-39): a reunião que já aconteceu (o SDR recebe por ela), o
 * produto vendido (NPAC-41; para o SDR, só o nome) e, no fim, "Registrar a venda agora" para quem
 * registra venda. Sem a venda, o lead entra como
 * "venda a registrar" e o closer da reunião é avisado. Fica na grade do `LeadForm`.
 */
export function SoldFields({
  team,
  products,
  canRegister,
}: {
  team: LeadCatalog['team'];
  products: ProductDTO[];
  /** `sale:register` (closer e liderança). O SDR não vê a venda nem valores. */
  canRegister: boolean;
}) {
  const [closerId, setCloserId] = useState('');
  const [register, setRegister] = useState(false);
  const [productId, setProductId] = useState('');
  const [total, setTotal] = useState('');
  const [method, setMethod] = useState<string>('PIX');
  const [entry, setEntry] = useState('');
  const [parts, setParts] = useState([{ amount: '', due: '' }]);
  // Closer da venda = closer da reunião: só os produtos dele.
  const closerProducts = products.filter((p) => p.closerId === closerId);
  const deferred = deferredMethod(method);
  const now = toBrasiliaInput(new Date().toISOString());
  // Quanto falta para fechar o total (some enquanto um valor está pela metade, ex.: "15,").
  const values = [total, method === 'PARTIAL' ? entry : '0', ...parts.map((p) => p.amount)].map(
    tryCents,
  );
  const remaining = values.includes(null)
    ? null
    : values[0]! - values.slice(1).reduce<number>((a, v) => a + v!, 0);

  return (
    <>
      <Field label="Data e hora da reunião (Brasília)">
        <input name={SOLD.meetingAt} type="datetime-local" className={control} max={now} required />
      </Field>
      <Field label="Closer da reunião">
        <select
          name={SOLD.meetingCloser}
          className={control}
          required
          value={closerId}
          onChange={(e) => {
            setCloserId(e.target.value);
            setProductId('');
          }}
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
          name={SOLD.product}
          className={control}
          required
          value={productId}
          disabled={!closerId}
          onChange={(e) => {
            setProductId(e.target.value);
            const p = products.find((x) => x.id === e.target.value);
            // O valor da venda começa com o preço do produto e pode ser editado.
            if (p && canRegister) setTotal(centsInput(p.priceCents));
          }}
        >
          <option value="" disabled>
            {!closerId
              ? 'Escolha antes o closer da reunião'
              : closerProducts.length
                ? 'Escolha o produto'
                : 'Este closer não tem produtos ativos'}
          </option>
          {closerProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {/* SDR vê só o nome (NPAC-41): os valores o closer põe ao registrar a venda. */}
              {canRegister ? `${p.name} — ${money(p.priceCents)}` : p.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="col-span-full -mt-1 text-xs text-ink2">
        A reunião entra como realizada e conta para o SDR no dia dela.
        {canRegister
          ? ''
          : ' O closer da reunião recebe o aviso e põe os valores ao registrar a venda.'}
      </p>
      {canRegister && (
        <fieldset className="sold-sale col-span-full flex flex-col gap-4 rounded-2xl border border-line p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name={SOLD.register}
              className="mt-0.5 size-5 accent-[var(--gold-deep)]"
              checked={register}
              onChange={(e) => {
                setRegister(e.target.checked);
                const p = products.find((x) => x.id === productId);
                if (e.target.checked && p && !total) setTotal(centsInput(p.priceCents));
              }}
            />
            <span className="flex flex-col">
              <span className="font-semibold">Registrar a venda agora</span>
              <span className="text-xs text-ink2">
                {register
                  ? 'A venda conta nos relatórios no dia em que aconteceu.'
                  : 'Sem a venda, o lead fica como "Venda a registrar" até o closer registrar.'}
              </span>
            </span>
          </label>
          {register && (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <Field label="Data da venda">
                <input
                  name={SOLD.closedOn}
                  type="date"
                  className={control}
                  max={spToday()}
                  required
                />
              </Field>
              <Field label="Valor total (R$)">
                <input
                  name={SOLD.total}
                  className={control}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  pattern="\d+([.,]\d{1,2})?"
                  title="Use números com até duas casas decimais, ex.: 1500,00"
                  required
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </Field>
              <Field label="Forma de pagamento">
                <select
                  name={SOLD.method}
                  className={control}
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {SALE_METHODS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {method === 'PARTIAL' && (
                <Field label="Já pago (R$)">
                  <input
                    name={SOLD.entry}
                    className={control}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    pattern="\d+([.,]\d{1,2})?"
                    title="Use números com até duas casas decimais, ex.: 1500,00"
                    required
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                  />
                </Field>
              )}
              {!deferred && (
                <p className="self-end pb-3 text-sm text-ink2">
                  Recebido por inteiro na data da venda.
                </p>
              )}
              {deferred && (
                <div className="col-span-full flex flex-col gap-3">
                  <p className="text-sm font-semibold">
                    Parcelas que faltam{' '}
                    {remaining !== null && (
                      <span
                        className={`font-normal ${remaining === 0 ? 'text-ink2' : 'text-danger'}`}
                        aria-live="polite"
                      >
                        ·{' '}
                        {remaining === 0
                          ? 'fecha o total'
                          : remaining > 0
                            ? `faltam ${money(remaining)}`
                            : `passou ${money(-remaining)}`}
                      </span>
                    )}
                  </p>
                  {parts.map((p, i) => (
                    <div key={i} className="grid gap-3 sm:grid-cols-2">
                      <Field label={`Parcela ${i + 1} (R$)`}>
                        <input
                          name={SOLD.partAmount}
                          className={control}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0,00"
                          required
                          value={p.amount}
                          onChange={(e) =>
                            setParts(
                              parts.map((v, n) => (n === i ? { ...v, amount: e.target.value } : v)),
                            )
                          }
                        />
                      </Field>
                      <Field label={`Vencimento ${i + 1} (Brasília)`}>
                        <input
                          name={SOLD.partDue}
                          type="datetime-local"
                          className={control}
                          min={now}
                          required
                          value={p.due}
                          onChange={(e) =>
                            setParts(
                              parts.map((v, n) => (n === i ? { ...v, due: e.target.value } : v)),
                            )
                          }
                        />
                      </Field>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
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
                </div>
              )}
            </div>
          )}
        </fieldset>
      )}
    </>
  );
}
