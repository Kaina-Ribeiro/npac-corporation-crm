/**
 * Datas do Acompanhamento (D9): o texto fica como foi colado (só sem espaços nas bordas) e a
 * data usada na ordem é derivada dele. `MM/AAAA` ordena como dia 1 sem mudar o texto. Data
 * ilegível fica nula e vai para o fim da ordem: nada de data inventada.
 */
export type DataParseada = { texto: string; data: string | null };

const pad = (n: number) => String(n).padStart(2, '0');

function iso(dia: number, mes: number, ano: number): string | null {
  if (mes < 1 || mes > 12 || ano < 1900 || ano > 2999) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
    return null;
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

export function parseData(entrada: string): DataParseada {
  const texto = entrada.trim();
  const completa = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (completa) return { texto, data: iso(+completa[1]!, +completa[2]!, +completa[3]!) };
  const mes = /^(\d{1,2})\/(\d{4})$/.exec(texto);
  if (mes) return { texto, data: iso(1, +mes[1]!, +mes[2]!) };
  return { texto, data: null };
}

/** Ordem cronológica calculada na leitura (regra 4): data, depois id; sem data vai para o fim. */
export function ordenarPorData<T extends { id: string; data: string | null }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    if (a.data !== b.data) {
      if (a.data === null) return 1;
      if (b.data === null) return -1;
      return a.data < b.data ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
