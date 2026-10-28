/**
 * Normaliza telefone brasileiro para E.164 (`+55DDNNNNNNNNN`).
 * Aceita DDD + 8 dígitos (fixo) ou DDD + 9 dígitos (celular, iniciando em 9),
 * com ou sem prefixo 55 / +55. Retorna null se inválido.
 */
export function normalizePhoneBR(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (digits.startsWith('0')) return null; // DDD inválido
  if (digits.length === 11 && digits[2] !== '9') return null; // celular começa com 9
  return `+55${digits}`;
}

/**
 * Normaliza handle do Instagram: minúsculo, sem `@`, sem URL/query/barras.
 * Retorna null se não casar com /^[a-z0-9._]{1,30}$/.
 */
export function normalizeInstagram(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^(www\.)?instagram\.com\//, '');
  s = s.split(/[?#]/)[0] ?? '';
  s = s.replace(/\/+$/, '').replace(/^@/, '');
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}
