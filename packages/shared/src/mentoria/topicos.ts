/**
 * Notas da ficha (Módulo 2): cada linha (cada Enter) vira um tópico; "Rótulo: texto" destaca o
 * rótulo quando o `:` está nos primeiros 40 caracteres (D13). Devolve texto puro: a tela
 * renderiza como texto (HTML nunca vira tag).
 */
export type Topico = { rotulo?: string; texto: string };

export function quebrarTopicos(notas: string | null | undefined): Topico[] {
  if (!notas) return [];
  return notas
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      if (i > 0 && i < 40) {
        const rotulo = l.slice(0, i).trim();
        const texto = l.slice(i + 1).trim();
        if (rotulo && texto) return { rotulo, texto };
      }
      return { texto: l };
    });
}
