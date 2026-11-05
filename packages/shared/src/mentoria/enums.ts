/** Status do mentorado (lista fixa do PDF, Módulo 1): muda a cor da linha no Dashboard. */
export const MENTORADO_STATUS = ['ENGAJADO', 'EM_ATENCAO', 'EM_RISCO'] as const;
export type MentoradoStatus = (typeof MENTORADO_STATUS)[number];

export const MENTORADO_STATUS_LABEL: Record<MentoradoStatus, string> = {
  ENGAJADO: 'Engajado',
  EM_ATENCAO: 'Em atenção',
  EM_RISCO: 'Em risco',
};

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
export const secaoDoCampo = (c: FichaCampoChave): 'PILAR' | 'EVOLUCAO' =>
  (PILAR_CHAVES as readonly string[]).includes(c) ? 'PILAR' : 'EVOLUCAO';

/** Limite do PDF: 256 KB por registro, somando os textos do registro e dos filhos. */
export const LIMITE_REGISTRO_BYTES = 256 * 1024;

/** Rótulos dos pilares e da evolução, como na ficha. */
export const FICHA_CAMPO_ROTULO: Record<FichaCampoChave, string> = {
  FE: 'Fé',
  SAUDE: 'Saúde',
  DINHEIRO: 'Dinheiro',
  RELACIONAMENTOS: 'Relacionamentos',
  RESERVA_FINANCEIRA: 'Reserva financeira',
  EVOLUCAO_RENDA: 'Evolução de renda',
  EVOLUCAO_SAUDE: 'Evolução na saúde',
  INVESTIMENTOS_MENTORIA: 'Investimentos feitos na mentoria',
  AREA_ATUACAO: 'Área de atuação',
};

/** Pendências do documento de escopo (PDF, 30/10/2026), texto literal. Marcar não persiste (D26). */
export const PENDENCIAS_PDF = [
  'Reanexar as fotos e vídeos cadastrados antes da correção do armazenamento (não foram recuperados)',
  'Publicar o medidor de espaço de mídia (pronto, aguardando OK)',
  'Verificar o botão Exportar (.json) na página publicada: a plataforma avisou que downloads diretos podem não funcionar para quem acessa pelo link',
  'Confirmar se "Gegê e Hellen" e "João Carlos (Gegê) e Hellen" são o mesmo casal (hoje há duas fichas no RDV)',
] as const;

/** Os 4 quadros rápidos do RDV ("Evoluções dentro da mentoria"), na ordem da ferramenta antiga. */
export const QUADRO_CHAVES = [
  'EVENTOS_PRESENCIAIS',
  'INVESTIMENTO_ATIVOS',
  'IMOVEL_LEILAO',
  'MERCADO_IMOBILIARIO',
] as const;
export type QuadroChave = (typeof QUADRO_CHAVES)[number];
export const QUADRO_ROTULO: Record<QuadroChave, string> = {
  EVENTOS_PRESENCIAIS: 'Eventos presenciais que já participou',
  INVESTIMENTO_ATIVOS: 'Investimento em ativos',
  IMOVEL_LEILAO: 'Imóvel de leilão',
  MERCADO_IMOBILIARIO: 'Mercado imobiliário',
};

/** Data de evento: sempre `DD/MM/AAAA` válida (regra 4); mês sozinho não serve. */
export const DATA_COMPLETA = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
