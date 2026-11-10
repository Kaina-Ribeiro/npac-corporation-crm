/** As mentorias vendidas (D14: são mentorias, não planos). */
export const MENTORIAS = ['RDV', '2M', '6M'] as const;
export type Mentoria = (typeof MENTORIAS)[number];

/** Perfil dentro do módulo (D3). Admin é um selo somado ao perfil, não um perfil (D13). */
export const PERFIS = ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR'] as const;
export type Perfil = (typeof PERFIS)[number];
export const PERFIL_LABEL: Record<Perfil, string> = {
  ACOMPANHAMENTO: 'Acompanhamento',
  OPERACAO: 'Operação',
  ESPECIALISTA: 'Especialista',
  MENTOR: 'Mentor',
};

export const INSCRICAO_STATUS = [
  'ONBOARDING',
  'ATIVO',
  'PAUSADO',
  'CANCELADO',
  'CONCLUIDO',
  'RENOVADO',
] as const;
export type InscricaoStatus = (typeof INSCRICAO_STATUS)[number];
export const INSCRICAO_STATUS_LABEL: Record<InscricaoStatus, string> = {
  ONBOARDING: 'Onboarding',
  ATIVO: 'Ativo',
  PAUSADO: 'Pausado',
  CANCELADO: 'Cancelado',
  CONCLUIDO: 'Concluído',
  RENOVADO: 'Renovado',
};

export const TIPOS_INSCRICAO = ['INDIVIDUAL', 'CASAL'] as const;
export type TipoInscricao = (typeof TIPOS_INSCRICAO)[number];
export const TIPO_INSCRICAO_LABEL: Record<TipoInscricao, string> = {
  INDIVIDUAL: 'Individual',
  CASAL: 'Casal',
};

export const OCUPACOES = ['EMPREGADO', 'AUTONOMO', 'EMPRESARIO'] as const;
export type Ocupacao = (typeof OCUPACOES)[number];
export const OCUPACAO_LABEL: Record<Ocupacao, string> = {
  EMPREGADO: 'Empregado',
  AUTONOMO: 'Autônomo',
  EMPRESARIO: 'Empresário',
};

export const ORIGENS = ['NACAO_MILIONARIA', 'CLUBE_DA_RIQUEZA', 'INSTAGRAM', 'INDICACAO'] as const;
export type Origem = (typeof ORIGENS)[number];
export const ORIGEM_LABEL: Record<Origem, string> = {
  NACAO_MILIONARIA: 'Nação Milionária',
  CLUBE_DA_RIQUEZA: 'Clube da Riqueza',
  INSTAGRAM: 'Instagram',
  INDICACAO: 'Indicação',
};

export const STATUS_FINANCEIRO = ['EM_DIA', 'EM_ATRASO', 'QUITADO'] as const;
export type StatusFinanceiro = (typeof STATUS_FINANCEIRO)[number];
export const STATUS_FINANCEIRO_LABEL: Record<StatusFinanceiro, string> = {
  EM_DIA: 'Em dia',
  EM_ATRASO: 'Em atraso',
  QUITADO: 'Quitado',
};

export const TECNOLOGIAS = ['BAIXA', 'MEDIA', 'ALTA'] as const;
export type Tecnologia = (typeof TECNOLOGIAS)[number];
export const TECNOLOGIA_LABEL: Record<Tecnologia, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
};

export const ORIGENS_ENDERECO = ['FORMULARIO_CAIXA', 'MANUAL'] as const;
export type OrigemEndereco = (typeof ORIGENS_ENDERECO)[number];

export const TIPOS_AVALIACAO = ['PROVA_10_HABILIDADES', 'PILARES'] as const;
export type TipoAvaliacao = (typeof TIPOS_AVALIACAO)[number];

// Formato do gerenciador antigo, lido por `legado.ts` e `json-backup.ts` na importação.

/** Status do mentorado (lista fixa do PDF, Módulo 1): muda a cor da linha no Dashboard. */
export const MENTORADO_STATUS = ['ENGAJADO', 'EM_ATENCAO', 'EM_RISCO'] as const;
export type MentoradoStatus = (typeof MENTORADO_STATUS)[number];

/** Os 4 pilares (antes e hoje), na ordem do PDF. */
export const PILAR_CHAVES = ['FE', 'SAUDE', 'DINHEIRO', 'RELACIONAMENTOS'] as const;
/** Os 5 itens de evolução (antes → depois), na ordem do PDF. */
export const EVOLUCAO_CHAVES = [
  'RESERVA_FINANCEIRA',
  'EVOLUCAO_RENDA',
  'EVOLUCAO_SAUDE',
  'INVESTIMENTOS_MENTORIA',
  'AREA_ATUACAO',
] as const;
export const FICHA_CAMPO_CHAVES = [...PILAR_CHAVES, ...EVOLUCAO_CHAVES] as const;
export type FichaCampoChave = (typeof FICHA_CAMPO_CHAVES)[number];
/** Os 4 quadros rápidos do RDV ("Evoluções dentro da mentoria"), na ordem da ferramenta antiga. */
export const QUADRO_CHAVES = [
  'EVENTOS_PRESENCIAIS',
  'INVESTIMENTO_ATIVOS',
  'IMOVEL_LEILAO',
  'MERCADO_IMOBILIARIO',
] as const;
export type QuadroChave = (typeof QUADRO_CHAVES)[number];
