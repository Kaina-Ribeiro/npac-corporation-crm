'use client';
import { cloneElement, useId, type ReactElement } from 'react';
import type { StageKey } from '@npac/shared';

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
/** Botões: classes em `globals.css` (`.btn-*`), com hover, pressionar e foco animados. */
export const button = 'btn btn-primary';
export const quietButton = 'btn btn-secondary';
export const ghostButton = 'btn btn-ghost';
export const dangerButton = 'btn btn-danger';

/**
 * Opções de "mover para". Venda só entra registrando a venda na ficha (a API recusa o
 * movimento direto), então aparece desabilitada para quem ainda não vendeu.
 */
export function StageOptions({
  stages,
  current,
}: {
  stages: { key: StageKey; label: string }[];
  current: StageKey;
}) {
  return stages.map((s) => {
    const locked = s.key === 'VENDA' && current !== 'VENDA';
    return (
      <option key={s.key} value={s.key} disabled={locked}>
        {locked ? `${s.label} (registre na ficha)` : s.label}
      </option>
    );
  });
}
