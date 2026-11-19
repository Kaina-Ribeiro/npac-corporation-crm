/**
 * Alcance (NPAC-54, Fase 3B). Arquivo à parte (`@npac/shared/alcance`, sem zod): o módulo de cargos entra no
 * JS de todas as telas, e /leads tem limite de 150 KB.
 */
import type { Perfil } from './mentoria/enums.js';

/**
 * Alcance (NPAC-54, Fase 3B): no cargo Acompanhamento, sem o selo, a pessoa vê todos os mentorados ou só
 * a carteira (as inscrições em que é a responsável). Quem decide o que cada um vê é a RLS (migration 0075);
 * aqui só os rótulos e a regra de gravação. Na tela (Gabriel 19/11, "Opção A"): cargo + tags em "Acessos"
 * ("Carteira" ou "Todos os mentorados"); nas listas, o selo do cargo e a tag "Carteira" ao lado.
 */
export const ALCANCES = ['TODOS', 'CARTEIRA'] as const;
export type Alcance = (typeof ALCANCES)[number];
export const ALCANCE_TITULO = 'Acessos';
export const ALCANCE_LABEL: Record<Alcance, string> = {
  TODOS: 'Todos os mentorados',
  CARTEIRA: 'Carteira',
};
/** Dica de cada tag: o que esse acesso permite (Gabriel 19/11, "pode ser"). */
export const ALCANCE_DICA: Record<Alcance, string> = {
  CARTEIRA:
    'Vê e cuida só dos mentorados em que é a responsável. Cadastra mentorados novos, que já entram na carteira dela.',
  TODOS: 'Vê e cuida de todos os mentorados do Acompanhamento.',
};
/** Ordem das tags na tela: "Carteira" primeiro (desenho A). */
export const ALCANCES_NA_TELA: readonly Alcance[] = ['CARTEIRA', 'TODOS'];

/** O alcance só vale no cargo Acompanhamento, sem o selo de Admin. */
export const alcanceVale = (c: { perfil: Perfil | null; moduloAdmin: boolean }) =>
  c.perfil === 'ACOMPANHAMENTO' && !c.moduloAdmin;

/**
 * Alcance a gravar: o pedido; sem ele, o atual se o cargo continua aceitando, senão TODOS. "Só a
 * carteira" num cargo que não aceita = `null` (a API responde 400, OPCAO_INVALIDA).
 */
export function resolverAlcance(
  pedido: Alcance | undefined,
  cargo: { perfil: Perfil | null; moduloAdmin: boolean },
  atual?: Alcance | null,
): Alcance | null {
  const vale = alcanceVale(cargo);
  if (pedido === 'CARTEIRA' && !vale) return null;
  if (pedido) return pedido;
  return vale ? (atual ?? 'TODOS') : 'TODOS';
}
