/**
 * Chave de comparação de nomes (regra 8 do PDF: nome já cadastrado é ignorado na importação).
 * Minúsculas, sem acento e com espaços colapsados. O nome exibido nunca muda: só a chave.
 */
export function nomeNormalizado(nome: string): string {
  return nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
