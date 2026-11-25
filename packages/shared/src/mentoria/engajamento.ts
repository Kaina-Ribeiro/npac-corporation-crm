// Engajamento marcado à mão na ficha e o bloco do Dashboard (NPAC-75). Puro, sem zod: o cliente importa.
import type { Mentoria, TipoInscricao } from './enums.js';

export const ENGAJAMENTOS = ['ENGAJADO', 'EM_ATENCAO', 'EM_RISCO'] as const;
export type Engajamento = (typeof ENGAJAMENTOS)[number];
/** Grupo do Dashboard: os três valores mais "Sem marcação" (coluna nula). */
export type GrupoEngajamento = Engajamento | 'SEM';
export const GRUPOS_ENGAJAMENTO: readonly GrupoEngajamento[] = [...ENGAJAMENTOS, 'SEM'];

/** Rótulo do valor na ficha. */
export const ENGAJAMENTO_LABEL: Record<GrupoEngajamento, string> = {
  ENGAJADO: 'Engajado',
  EM_ATENCAO: 'Em atenção',
  EM_RISCO: 'Em risco',
  SEM: 'Sem marcação',
};
/** Rótulo do grupo no Dashboard (plural, como no protótipo aprovado). */
export const GRUPO_ENGAJAMENTO_LABEL: Record<GrupoEngajamento, string> = {
  ENGAJADO: 'Engajados',
  EM_ATENCAO: 'Em atenção',
  EM_RISCO: 'Em risco',
  SEM: 'Sem marcação',
};
/** Classe de cor (verde, amarelo e vermelho do semáforo; cinza neutro sem marcação). */
export const ENGAJAMENTO_COR: Record<GrupoEngajamento, string> = {
  ENGAJADO: 'verde',
  EM_ATENCAO: 'amarelo',
  EM_RISCO: 'vermelho',
  SEM: 'neutro',
};

/** Status que ficam fora do Total (3C). */
export const FORA_DO_TOTAL = ['CANCELADO', 'CONCLUIDO'] as const;

const limparVariante = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ');

/** "2M / 2 encontros", ou só "2M" sem variante. */
export function rotuloMentoria(mentoria: Mentoria, variante: string | null | undefined): string {
  const v = limparVariante(variante);
  return v ? `${mentoria} / ${v}` : mentoria;
}

export type PessoaEngajamento = {
  inscricaoId: string;
  nome: string;
  tipo: TipoInscricao;
  mentoria: Mentoria;
  variante: string | null;
  engajamento: Engajamento | null;
  pessoas: { nome: string; apelido: string | null; fotoMidiaId: string | null }[];
};

export type PainelEngajamento = {
  total: number;
  grupos: { grupo: GrupoEngajamento; total: number; pessoas: PessoaEngajamento[] }[];
  /** Contagem por mentoria + variante, maior primeiro. */
  tipos: { rotulo: string; total: number }[];
};

/**
 * Monta o bloco a partir das inscrições do Total, já na ordem dos nomes. A variante conta sem diferença de maiúsculas
 * e espaços; o rótulo é a primeira forma encontrada.
 */
export function montarEngajamento(itens: readonly PessoaEngajamento[]): PainelEngajamento {
  const grupos = GRUPOS_ENGAJAMENTO.map((grupo) => ({
    grupo,
    total: 0,
    pessoas: [] as PessoaEngajamento[],
  }));
  const tipos = new Map<string, { rotulo: string; total: number }>();
  for (const i of itens) {
    const g = grupos.find((x) => x.grupo === (i.engajamento ?? 'SEM'))!;
    g.total += 1;
    g.pessoas.push(i);
    const chave = `${i.mentoria}|${limparVariante(i.variante).toLocaleLowerCase('pt-BR')}`;
    const t = tipos.get(chave);
    if (t) t.total += 1;
    else tipos.set(chave, { rotulo: rotuloMentoria(i.mentoria, i.variante), total: 1 });
  }
  return {
    total: itens.length,
    grupos,
    tipos: [...tipos.values()].sort(
      (a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
    ),
  };
}

/** "N% do total", arredondado; 0% com Total zero. */
export function pctDoTotal(n: number, total: number): string {
  return `${total ? Math.round((n / total) * 100) : 0}% do total`;
}
