// Importação única da planilha "CRONOGRAMA" (NPAC-60, fase 3; desenho §2, §8, C8, C9, C14, C15).
// Lógica pura, sem zod: lê o CSV da aba e casa cada coluna (um mentorado) com as inscrições do sistema.
// Nada aqui devolve o texto de uma célula marcada: o que não é mês vira só um motivo contado.

import { BLOCOS, normalizarItem, type Bloco } from './cronograma.js';
import { nomeNormalizado } from './normalizar.js';

export type MarcaPlanilha = 'RECEBIDO' | 'NAO_FEZ' | 'JA_TINHA';

/** Por que uma célula preenchida ficou de fora (C9). */
export const MOTIVOS_IGNORADA = ['MES_FORA', 'TEXTO'] as const;
export type MotivoIgnorada = (typeof MOTIVOS_IGNORADA)[number];
export const MOTIVO_IGNORADA_LABEL: Record<MotivoIgnorada, string> = {
  MES_FORA: 'Mês fora de 1 a 12',
  TEXTO: 'Texto que não é mês (nome solto, observação)',
};

export type ItemPlanilha = { bloco: Bloco; texto: string; linha: number };

export type MarcaColuna = {
  /** Linha (do arquivo, a partir de 1) do item: a da primeira vez que ele aparece no bloco. */
  linhaItem: number;
  /** Nulo em "já tinha antes" e em "não fez" sem mês. */
  pmeNumero: number | null;
  resultado: MarcaPlanilha;
};

export type ColunaPlanilha = {
  /** Posição da coluna no arquivo (A = 0). */
  indice: number;
  /** Nome do cabeçalho de cima (a pessoa da coluna); vazio quando não há. */
  cabecalho: string;
  marcas: MarcaColuna[];
  ignoradas: number;
};

export type PlanilhaCronograma = {
  itens: ItemPlanilha[];
  /** Itens que apareceram de novo no mesmo bloco e foram juntados ao primeiro (C15). */
  juntados: Record<Bloco, number>;
  colunas: ColunaPlanilha[];
  ignoradasPorMotivo: Record<MotivoIgnorada, number>;
};

/** Coluna para quem lê: "Coluna 4" (a contagem da planilha, A = 1). */
export const numeroDaColuna = (indice: number) => indice + 1;

/** CSV (RFC 4180): aspas, vírgula e quebra de linha dentro da célula, BOM no começo. */
export function lerCsv(texto: string): string[][] {
  const s = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas: string[][] = [];
  let linha: string[] = [];
  let cel = '';
  let aspas = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]!;
    if (aspas) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cel += '"';
          i += 1;
        } else aspas = false;
      } else cel += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') {
      linha.push(cel);
      cel = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      linha.push(cel);
      linhas.push(linha);
      linha = [];
      cel = '';
    } else cel += c;
  }
  if (cel !== '' || linha.length) {
    linha.push(cel);
    linhas.push(linha);
  }
  return linhas;
}

const limpo = (t: string | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();
const COLUMN_N = /^column \d+$/i;

const TITULOS: Record<string, Bloco> = {
  experiencias: 'EXPERIENCIA',
  experiencia: 'EXPERIENCIA',
  desafios: 'DESAFIO',
  desafio: 'DESAFIO',
  filmes: 'FILME',
  filme: 'FILME',
  livros: 'LIVRO',
  livro: 'LIVRO',
  eap: 'EAP',
  eaps: 'EAP',
};

const MES = /^(\d{1,2})\s*[º°ªo]?\s*(mes)?\.?$/;
const JA_TINHA = /^ja (leu|leram|li|lemos|viu|viram|assistiu|assistiram)\b/;
const NAO_FEZ = /^nao (fez|fizeram|concluiu|concluiram)\b/;
const MES_DENTRO = /(\d{1,2})\s*[º°ªo]?\s*mes\b/;

type Celula =
  | { tipo: 'MARCA'; pmeNumero: number | null; resultado: MarcaPlanilha }
  | { tipo: 'IGNORADA'; motivo: MotivoIgnorada }
  | { tipo: 'VAZIA' };

/** Uma célula de mentorado (C9): "Nº mês" com as variações, "já leu…", "não fez…"; o resto fica de fora. */
export function lerCelula(texto: string): Celula {
  const t = limpo(texto).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (!t) return { tipo: 'VAZIA' };
  const m = MES.exec(t);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 12
      ? { tipo: 'MARCA', pmeNumero: n, resultado: 'RECEBIDO' }
      : { tipo: 'IGNORADA', motivo: 'MES_FORA' };
  }
  if (JA_TINHA.test(t)) return { tipo: 'MARCA', pmeNumero: null, resultado: 'JA_TINHA' };
  if (NAO_FEZ.test(t)) {
    const d = MES_DENTRO.exec(t);
    const n = d ? Number(d[1]) : null;
    return {
      tipo: 'MARCA',
      pmeNumero: n !== null && n >= 1 && n <= 12 ? n : null,
      resultado: 'NAO_FEZ',
    };
  }
  return { tipo: 'IGNORADA', motivo: 'TEXTO' };
}

/** Qual marca vale quando o mesmo item aparece duas vezes (C15): "já tinha" primeiro, depois o menor mês. */
export function marcaPrimeiro(a: MarcaColuna, b: MarcaColuna): MarcaColuna {
  const peso = (m: MarcaColuna) => (m.resultado === 'JA_TINHA' ? 0 : (m.pmeNumero ?? 0.5));
  return peso(b) < peso(a) ? b : a;
}

const blocosVazios = <T>(v: () => T): Record<Bloco, T> =>
  Object.fromEntries(BLOCOS.map((b) => [b, v()])) as Record<Bloco, T>;

/**
 * Lê a aba CRONOGRAMA (§8, passo 2). A 1ª linha traz os nomes (coluna C em diante) e abre as
 * Experiências; o bloco muda na linha cujo texto da coluna B é um dos 5 títulos e cuja coluna C repete
 * um nome do cabeçalho, é "Column N" ou está vazia. Item = coluna B com texto e coluna A vazia, número
 * ou "Column N"; o resto (o modelo do PME no fim) não é item.
 */
export function lerCronograma(csv: string): PlanilhaCronograma {
  const linhas = lerCsv(csv);
  const topo = linhas[0] ?? [];
  const largura = Math.max(0, ...linhas.map((l) => l.length));
  const cabecalho = (i: number) => {
    const t = limpo(topo[i]);
    return COLUMN_N.test(t) ? '' : t;
  };
  const nomesTopo = new Set(
    topo
      .slice(2)
      .map((t) => nomeNormalizado(limpo(t)))
      .filter(Boolean),
  );

  const itens: ItemPlanilha[] = [];
  const juntados = blocosVazios(() => 0);
  const ignoradasPorMotivo: Record<MotivoIgnorada, number> = { MES_FORA: 0, TEXTO: 0 };
  /** Linha do primeiro item com o mesmo texto no bloco. */
  const primeiro = new Map<string, number>();
  const marcas = new Map<number, Map<number, MarcaColuna>>();
  const ignoradas = new Map<number, number>();

  let bloco: Bloco | null = null;
  for (const [k, l] of linhas.entries()) {
    const a = limpo(l[0]);
    const b = limpo(l[1]);
    const c = limpo(l[2]);
    const titulo = TITULOS[normalizarItem(b)];
    const repeteCabecalho = k === 0 || !c || COLUMN_N.test(c) || nomesTopo.has(nomeNormalizado(c));
    if (titulo && repeteCabecalho) {
      bloco = titulo;
      continue;
    }
    if (!bloco || !b) continue;
    if (a && !/^\d+$/.test(a) && !COLUMN_N.test(a)) continue;
    const linha = k + 1;
    const chave = `${bloco}:${normalizarItem(b)}`;
    if (!normalizarItem(b)) continue;
    let linhaItem = primeiro.get(chave);
    if (linhaItem === undefined) {
      linhaItem = linha;
      primeiro.set(chave, linha);
      itens.push({ bloco, texto: b, linha });
    } else juntados[bloco] += 1;
    for (let i = 2; i < l.length; i += 1) {
      const cel = lerCelula(l[i]!);
      if (cel.tipo === 'VAZIA') continue;
      if (cel.tipo === 'IGNORADA') {
        ignoradasPorMotivo[cel.motivo] += 1;
        ignoradas.set(i, (ignoradas.get(i) ?? 0) + 1);
        continue;
      }
      const daColuna = marcas.get(i) ?? new Map<number, MarcaColuna>();
      marcas.set(i, daColuna);
      const nova: MarcaColuna = {
        linhaItem,
        pmeNumero: cel.pmeNumero,
        resultado: cel.resultado,
      };
      const ja = daColuna.get(linhaItem);
      daColuna.set(linhaItem, ja ? marcaPrimeiro(ja, nova) : nova);
    }
  }

  const colunas: ColunaPlanilha[] = [];
  for (let i = 2; i < largura; i += 1) {
    const m = [...(marcas.get(i)?.values() ?? [])].sort((x, y) => x.linhaItem - y.linhaItem);
    const ign = ignoradas.get(i) ?? 0;
    const nome = cabecalho(i);
    // Coluna sem nome e sem nada marcado (as 12 vazias da planilha): não é um mentorado.
    if (!nome && !m.length && !ign) continue;
    colunas.push({ indice: i, cabecalho: nome, marcas: m, ignoradas: ign });
  }
  return { itens, juntados, colunas, ignoradasPorMotivo };
}

/** Maior mês marcado na coluna (para a Admin decidir entre RDV e 2M, C14). */
export const maiorMes = (c: ColunaPlanilha): number | null =>
  c.marcas.reduce<number | null>(
    (max, m) => (m.pmeNumero !== null && (max === null || m.pmeNumero > max) ? m.pmeNumero : max),
    null,
  );

// ------------------------------------------------------------------ casamento das colunas (C14)

export type InscricaoParaCasar = {
  id: string;
  /** Nomes das pessoas, na ordem (pessoa 1, pessoa 2). */
  nomes: string[];
  tipo: 'INDIVIDUAL' | 'CASAL';
  mentoria: string;
  status: string;
  /** Número do ciclo mais recente; nulo sem nenhum PME. */
  pmeAtual: number | null;
};

export type SituacaoColuna = 'LIGADA' | 'DUVIDA' | 'SEM_FICHA' | 'SEM_MARCACAO';

export type CasamentoColuna = {
  indice: number;
  situacao: SituacaoColuna;
  /** Ids das inscrições que casam com o nome (uma só em LIGADA). */
  candidatas: string[];
  maiorMes: number | null;
};

const CONECTIVOS = new Set(['e', 'de', 'da', 'do', 'das', 'dos']);
/** Rótulos que às vezes vêm junto do nome na planilha e não são nome. */
const NAO_NOME = new Set(['rdv', '2m', '6m', 'casal']);
const tokens = (nome: string) =>
  nomeNormalizado(nome)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .split(' ')
    .filter((t) => t && !CONECTIVOS.has(t) && !NAO_NOME.has(t));

/** "Ana" casa com "Ana Souza"; "Ana Souza" com "Ana Maria Souza": mesmo primeiro nome e o resto contido. */
function casaNome(daPlanilha: string[], daFicha: string): boolean {
  const f = tokens(daFicha);
  return daPlanilha.length > 0 && daPlanilha[0] === f[0] && daPlanilha.every((t) => f.includes(t));
}

/** "A e B", "A & B", "A/B", "A / B": as duas pessoas do casal; senão uma só. */
export function pessoasDaColuna(cabecalho: string): string[][] {
  const partes = cabecalho
    .split(/\s*\/\s*|\s+(?:e|&)\s+/i)
    .map((p) => tokens(p))
    .filter((p) => p.length);
  return partes.length >= 2 ? partes.slice(0, 2) : partes;
}

/**
 * Casa as colunas com as inscrições (C14): automático só com uma única candidata; várias (inclusive o
 * RDV e a 2M da mesma pessoa) ou nenhuma ficam para a Admin decidir. Casal casa com inscrição CASAL
 * pelas duas pessoas; nome só casa com qualquer pessoa de qualquer inscrição.
 */
export function casarColunas(
  colunas: ColunaPlanilha[],
  inscricoes: InscricaoParaCasar[],
): CasamentoColuna[] {
  return colunas.map((c) => {
    const mes = maiorMes(c);
    if (!c.marcas.length)
      return { indice: c.indice, situacao: 'SEM_MARCACAO', candidatas: [], maiorMes: mes };
    const pessoas = pessoasDaColuna(c.cabecalho);
    const candidatas = !pessoas.length
      ? []
      : inscricoes
          .filter((i) => {
            if (pessoas.length === 2) {
              if (i.tipo !== 'CASAL' || i.nomes.length < 2) return false;
              const [a, b] = pessoas as [string[], string[]];
              const [p1, p2] = i.nomes as [string, string];
              return (casaNome(a, p1) && casaNome(b, p2)) || (casaNome(a, p2) && casaNome(b, p1));
            }
            return i.nomes.some((n) => casaNome(pessoas[0]!, n));
          })
          .map((i) => i.id);
    const situacao: SituacaoColuna =
      candidatas.length === 1 ? 'LIGADA' : candidatas.length ? 'DUVIDA' : 'SEM_FICHA';
    return { indice: c.indice, situacao, candidatas, maiorMes: mes };
  });
}

/**
 * Dica azul da dúvida (protótipo, caso RDV × 2M): entre fichas da mesma pessoa (mesmos nomes), quando só uma chega ao maior mês da
 * coluna (concluída, ou com o PME atual até lá), "Vai até o 12º mês: deve ser o RDV." e, se for o RDV
 * e houver 2M/6M entre as outras, "Vale também na 2M." (a continuidade, C7). Sem uma só: nada.
 */
export function dicaDaDuvida(
  mes: number | null,
  candidatas: Pick<InscricaoParaCasar, 'nomes' | 'mentoria' | 'status' | 'pmeAtual'>[],
): string | null {
  if (mes === null || candidatas.length < 2) return null;
  // Só entre fichas da mesma pessoa (o caso RDV × 2M); com pessoas diferentes a dica enganaria.
  const pessoa = (c: { nomes: string[] }) => c.nomes.map((n) => tokens(n).join(' ')).join('|');
  if (new Set(candidatas.map(pessoa)).size > 1) return null;
  const cabem = candidatas.filter((c) => c.status === 'CONCLUIDO' || (c.pmeAtual ?? 0) >= mes);
  if (cabem.length !== 1) return null;
  const certa = cabem[0]!;
  const outras = [...new Set(candidatas.filter((c) => c !== certa).map((c) => c.mentoria))].filter(
    (m) => m !== certa.mentoria && certa.mentoria === 'RDV',
  );
  return `Vai até o ${mes}º mês: deve ser o ${certa.mentoria}.${
    outras.length ? ` Vale também na ${outras.join(' e na ')}.` : ''
  }`;
}
