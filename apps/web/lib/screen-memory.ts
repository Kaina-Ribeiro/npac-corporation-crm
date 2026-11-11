/**
 * Memória da aba (NPAC-46): busca por texto e página ficam só aqui, num mapa do módulo. Voltam ao
 * trocar de tela dentro do app e somem no F5; nunca vão para cookie, URL ou storage. A chave é o
 * nome do cookie da tela, que já tem o hash da pessoa.
 */
const memory = new Map<string, unknown>();

export const recall = <T>(key: string) => memory.get(key) as T | undefined;

export function keep(key: string, value: unknown) {
  if (value === undefined) memory.delete(key);
  else memory.set(key, value);
}
