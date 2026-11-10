'use client';
import { cloneElement, useId, type ReactElement } from 'react';
import type { StageKey } from '@npac/shared';
import { INCOME_DISCOVERY_STAGE } from '@npac/shared/enums';

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm font-semibold text-ink2">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
export function FormError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-danger">
      {message}
    </p>
  ) : null;
}
export const control = 'field w-full text-ink dark:!bg-white/10';
export { button, dangerButton, ghostButton, quietButton } from '@/lib/button';

/**
 * Opções de "mover para". Venda só entra registrando a venda na ficha (a API recusa o
 * movimento direto), então aparece desabilitada para quem ainda não vendeu.
 */
export function StageOptions({
  stages,
  current,
  allowSale = false,
  incomeUnknown = false,
}: {
  stages: { key: StageKey; label: string }[];
  current: StageKey;
  /** Cadastro (NPAC-39): Venda Fechada entra com a reunião e, se quiser, a venda. */
  allowSale?: boolean;
  /** "Descobrindo renda" (Igor, 10/11/2026): só Criando Relacionamento até informar a faixa. */
  incomeUnknown?: boolean;
}) {
  return stages.map((s) => {
    const sale = s.key === 'VENDA' && current !== 'VENDA' && !allowSale;
    const income = incomeUnknown && s.key !== INCOME_DISCOVERY_STAGE;
    return (
      <option key={s.key} value={s.key} disabled={sale || income}>
        {income
          ? `${s.label} (informe a renda)`
          : sale
            ? `${s.label} (registre na ficha)`
            : s.label}
      </option>
    );
  });
}
