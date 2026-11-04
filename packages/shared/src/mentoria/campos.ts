/**
 * Colunas com texto sensível cifrado (D19), por tabela. Nome, datas, status e link da pasta
 * ficam em claro (busca e dedupe). Base do teste "nenhum texto sensível em claro no banco".
 */
export const DIAGNOSTICO_CHAVES = [
  'idade',
  'situacao_conjugal',
  'filhos',
  'trabalho',
  'renda_atual',
  'dinheiro_guardado',
  'patrimonio',
  'dividas',
  'sonhos_objetivos',
] as const;
export type DiagnosticoChave = (typeof DIAGNOSTICO_CHAVES)[number];

export const CAMPOS_SENSIVEIS = {
  mentoria_fichas: ['notas_momento_inicial', 'notas_momento_atual', 'tempo_mentoria_texto'],
  mentoria_ficha_campos: ['antes', 'depois'],
  mentoria_conquistas: ['descricao'],
  mentoria_rdv_diagnostico: [...DIAGNOSTICO_CHAVES],
  mentoria_rdv_quadros: ['descricao'],
  mentoria_rdv_eventos: ['descricao'],
  mentoria_rdv_duvidas: ['texto'],
} as const satisfies Record<string, readonly string[]>;
