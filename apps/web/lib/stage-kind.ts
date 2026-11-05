import { MEETING_ORIGIN_BY_STAGE } from '@npac/shared/enums';

/**
 * Que campos cada etapa pede (NPAC-38). Arquivo leve à parte: a lista de leads só precisa saber
 * se abre a janelinha, sem carregar a leitura dos campos (fica na janelinha, baixada sob demanda).
 */
export type StageFieldsKind = 'MEETING' | 'PAYMENT' | 'REASON' | 'RETRY' | 'NEXT';

export function stageFieldsKind(stage: string): StageFieldsKind {
  if (MEETING_ORIGIN_BY_STAGE[stage]) return 'MEETING';
  if (stage === 'AGENDOU_PAGAMENTO') return 'PAYMENT';
  if (stage === 'PERDIDO') return 'REASON';
  if (stage === 'NO_SHOW') return 'RETRY';
  return 'NEXT';
}

/** Mudar para estas etapas pede dados: Pipeline, lista e ficha abrem os campos antes de salvar. */
export const stageNeedsFields = (stage: string) => {
  const kind = stageFieldsKind(stage);
  return kind === 'MEETING' || kind === 'PAYMENT' || kind === 'REASON';
};
