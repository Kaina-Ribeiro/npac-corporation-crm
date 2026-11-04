import { MENTORADO_STATUS_LABEL, type MentoradoStatus } from './enums.js';
import { nomeNormalizado } from './normalizar.js';

/** Colunas do Dashboard, na ordem do PDF (Módulo 1). */
export const COLUNAS_PLANILHA = ['Nome', 'Tipo', 'Tipo de mentoria', 'Data de entrada', 'Status'];

export type LinhaPlanilha = {
  /** Número da linha no texto colado (1 = primeira). */
  linha: number;
  nome: string;
  tipoCadastro: string | null;
  tipoMentoria: string | null;
  dataEntrada: string | null;
  status: MentoradoStatus | null;
};
export type Faltando = 'STATUS' | 'TIPO_MENTORIA';

const STATUS_POR_TEXTO = new Map(
  (Object.entries(MENTORADO_STATUS_LABEL) as [MentoradoStatus, string][]).flatMap(([k, v]) => [
    [nomeNormalizado(v), k],
    [nomeNormalizado(k.replace('_', ' ')), k],
  ]),
);

const vazioViraNulo = (s: string | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/**
 * "Colar planilha" do Dashboard: colunas por tab ou `;`, uma linha por mentorado, cabeçalho
 * opcional. Texto fica como veio (só sem espaços nas bordas). Linha sem status reconhecido ou
 * sem tipo de mentoria vai para `pendentes` e só grava com a escolha da equipe (D27).
 */
export function parseColaPlanilha(texto: string) {
  const linhas: LinhaPlanilha[] = [];
  const pendentes: { linha: number; faltando: Faltando[] }[] = [];
  const invalidas: number[] = [];
  const brutas = texto.replace(/\r\n?/g, '\n').split('\n');
  brutas.forEach((bruta, i) => {
    if (!bruta.trim()) return;
    const sep = bruta.includes('\t') ? '\t' : ';';
    const cols = bruta.split(sep);
    const numero = i + 1;
    if (i === brutas.findIndex((b) => b.trim()) && ehCabecalho(cols)) return;
    const nome = vazioViraNulo(cols[0]);
    if (!nome) {
      invalidas.push(numero);
      return;
    }
    const status = STATUS_POR_TEXTO.get(nomeNormalizado(cols[4] ?? '')) ?? null;
    const l: LinhaPlanilha = {
      linha: numero,
      nome,
      tipoCadastro: vazioViraNulo(cols[1]),
      tipoMentoria: vazioViraNulo(cols[2]),
      dataEntrada: vazioViraNulo(cols[3]),
      status,
    };
    const faltando: Faltando[] = [];
    if (!l.tipoMentoria) faltando.push('TIPO_MENTORIA');
    if (!l.status) faltando.push('STATUS');
    if (faltando.length) pendentes.push({ linha: numero, faltando });
    linhas.push(l);
  });
  return { linhas, pendentes, invalidas };
}

function ehCabecalho(cols: string[]): boolean {
  return nomeNormalizado(cols[0] ?? '') === 'nome' && cols.length >= 2;
}
