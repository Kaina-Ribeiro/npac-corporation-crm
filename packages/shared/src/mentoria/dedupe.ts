import { nomeNormalizado } from './normalizar.js';

/**
 * Regra 8 do PDF: nome já cadastrado é ignorado na importação. Compara pelo nome normalizado
 * (D3). Dentro da própria colagem, o mesmo nome conta uma vez (o primeiro entra).
 * Devolve índices, nunca nomes (a prévia não leva dado pessoal).
 */
export function classificarNomes(base: ReadonlySet<string>, nomes: readonly string[]) {
  const vistos = new Set<string>();
  const novos: number[] = [];
  const jaExistem: number[] = [];
  const repetidos: number[] = [];
  nomes.forEach((nome, i) => {
    const n = nomeNormalizado(nome);
    if (base.has(n)) jaExistem.push(i);
    else if (vistos.has(n)) repetidos.push(i);
    else {
      vistos.add(n);
      novos.push(i);
    }
  });
  return { novos, jaExistem, repetidos };
}
