/** Conversão decimal por dígitos: evita erros de parseFloat * 100. */
export function parseCents(value: string): number {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Use um valor positivo com até duas casas decimais.');
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 2_000_000_000)
    throw new Error('Valor fora do limite suportado.');
  return cents;
}
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
