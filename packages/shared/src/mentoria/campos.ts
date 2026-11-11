/**
 * Colunas com texto sensível cifrado, por tabela. Nome e datas ficam em claro (busca e calendário).
 * Base do teste "WhatsApp e e-mail não aparecem em claro no banco".
 */
export const CAMPOS_SENSIVEIS = {
  mentoria_pessoas: ['whatsapp', 'email'],
  mentoria_enderecos: ['endereco'],
  mentoria_momento_inicial: ['dor', 'sonho', 'meta'],
  mentoria_anotacoes: ['texto'],
  mentoria_legado: ['dados'],
  mentoria_acoes: ['observacao'],
  mentoria_pausas: ['motivo'],
} as const satisfies Record<string, readonly string[]>;

/** Campos do diagnóstico do gerenciador antigo, lidos na importação. */
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
