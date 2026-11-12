import { keep, recall } from './screen-memory';

/**
 * O navegador só deixa o JS ler os cookies do caminho em que a página foi carregada: depois de uma
 * navegação do Next (`/dashboard` → `/leads`), `document.cookie` não enxerga o cookie de `/leads`,
 * embora ele vá nas requisições. Por isso o valor gravado nesta aba fica também na memória, semeado
 * pelo valor que o servidor leu (`fallback`) na primeira vez.
 */
const chave = (name: string) => `cookie:${name}`;

/** Registra o valor gravado agora (vazio = apagado). */
export const notePreference = (name: string, value: string) => keep(chave(name), value);

/** Lê o cookie no navegador: memória da aba, `document.cookie` (se visível), o valor do servidor. */
export function readPreference(name: string, fallback?: string) {
  const own = recall<string>(chave(name));
  if (own !== undefined) return own;
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  if (hit) return hit.slice(name.length + 1);
  // Sem gravação nesta aba, o cookie é o mesmo que o servidor leu.
  if (fallback !== undefined) notePreference(name, fallback);
  return fallback;
}
