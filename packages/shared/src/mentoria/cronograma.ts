// Cronograma do PME (NPAC-60, desenho docs/superpowers/specs/2026-11-24-cronograma-design.md).
// Lógica pura, sem zod: experiências, desafios, filmes, livros e EAP que cada mentorado recebe em cada PME.

export const BLOCOS = ['EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP'] as const;
export type Bloco = (typeof BLOCOS)[number];

export const BLOCO_LABEL: Record<Bloco, string> = {
  EXPERIENCIA: 'Experiência',
  DESAFIO: 'Desafio',
  FILME: 'Filme',
  LIVRO: 'Livro',
  EAP: 'EAP',
};

export const BLOCO_PLURAL: Record<Bloco, string> = {
  EXPERIENCIA: 'Experiências',
  DESAFIO: 'Desafios',
  FILME: 'Filmes',
  LIVRO: 'Livros',
  EAP: 'EAP',
};

/** Modelo do PME escrito no fim da planilha (C5): é sugestão, nunca obrigação. */
export const MODELO_PME: Record<Bloco, number> = {
  EAP: 3,
  EXPERIENCIA: 1,
  DESAFIO: 1,
  FILME: 2,
  LIVRO: 1,
};

/** Itens do cronograma por envio (o mesmo limite das extras do catálogo). */
export const LIMITE_CRONOGRAMA_ENVIO = 20;
/** Texto de um item (banco ou "só desta pessoa"). */
export const LIMITE_TEXTO_ITEM = 2000;

/**
 * Chave de comparação do item (único por bloco no banco): minúsculas, sem acento, pontuação virando
 * espaço e espaços colapsados. A API grava em `texto_norm` (o `unaccent` não serve em coluna gerada).
 */
export function normalizarItem(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Inscrição com variante "sem cronograma" (C6): o envio abre sem sugestões. */
export function semCronograma(variante: string | null | undefined): boolean {
  if (!variante) return false;
  return normalizarItem(variante).includes('sem cronograma');
}

export type ItemBanco = { id: string; bloco: Bloco; texto: string; ordem: number; ativo: boolean };

export type ResultadoRecebido =
  | 'FEITA'
  | 'PARCIAL'
  | 'NAO_FEITA'
  | 'PENDENTE'
  | 'RECEBIDO'
  | 'NAO_FEZ'
  | 'JA_TINHA'
  | 'PLANEJADO';

/**
 * Um item que a pessoa já tem no cronograma: tarefa `PME` (resultado da tarefa) ou linha que veio da
 * planilha (`RECEBIDO`, `NAO_FEZ`, `JA_TINHA`, `PLANEJADO`). `propria` = desta inscrição; as outras são
 * da mesma pessoa em outra inscrição (WhatsApp ou e-mail igual, C7).
 */
export type Recebido = {
  itemId: string;
  bloco: Bloco;
  pmeNumero: number | null;
  resultado: ResultadoRecebido;
  inscricaoId: string;
  mentoria: string;
  propria: boolean;
};

/**
 * "Já recebido" (§6): não pode ir de novo. `PLANEJADO` da própria inscrição fica reservado para o PME
 * dele (não conta como recebido); o de outra inscrição conta. `numero` = o PME que está sendo montado.
 */
export function jaRecebido(r: Recebido, _numero: number): boolean {
  return !(r.resultado === 'PLANEJADO' && r.propria);
}

/** Frase da recusa de repetir (409 da API e dica da tela). */
export function motivoJaRecebido(r: Recebido): string {
  if (!r.propria) return `Esse item já foi do ${r.mentoria}`;
  if (r.pmeNumero == null) return 'A pessoa já tinha esse item antes';
  return `Esse item já foi do ${r.pmeNumero}º PME`;
}

const vazio = (): Record<Bloco, ItemBanco[]> => ({
  EXPERIENCIA: [],
  DESAFIO: [],
  FILME: [],
  LIVRO: [],
  EAP: [],
});

/**
 * Sugestão do envio do PME `numero` (C4): por bloco, primeiro os `PLANEJADO` próprios desse número
 * (vieram da planilha, todos entram), depois os itens ativos, na ordem do banco, que a pessoa não
 * recebeu nem tem reservados para outro PME, até completar o modelo. Sem cronograma: nada.
 */
export function sugerirItens(
  banco: ItemBanco[],
  recebidos: Recebido[],
  numero: number,
  sem: boolean,
): Record<Bloco, ItemBanco[]> {
  const out = vazio();
  if (sem) return out;
  const planejados = new Set<string>();
  const ocupados = new Set<string>();
  for (const r of recebidos) {
    if (r.resultado === 'PLANEJADO' && r.propria && r.pmeNumero === numero)
      planejados.add(r.itemId);
    else ocupados.add(r.itemId);
  }
  const ordenado = banco.filter((i) => i.ativo).sort((a, b) => a.ordem - b.ordem);
  for (const i of ordenado) {
    if (planejados.has(i.id) && !ocupados.has(i.id)) out[i.bloco].push(i);
  }
  for (const i of ordenado) {
    const lista = out[i.bloco];
    if (lista.length >= MODELO_PME[i.bloco]) continue;
    if (planejados.has(i.id) || ocupados.has(i.id)) continue;
    lista.push(i);
  }
  return out;
}
