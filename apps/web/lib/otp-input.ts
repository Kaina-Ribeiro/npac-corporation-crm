import type { FormEvent } from 'react';

/** Envia o formulário sozinho quando o código de 6 dígitos fica completo (digitado ou colado). */
export function submitWhenComplete(e: FormEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  if (input.value.replace(/\D/g, '').length === 6) input.form?.requestSubmit();
}
