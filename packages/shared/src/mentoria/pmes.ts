// PMEs, ciclos e tarefas (Fase 2, spec 2026-11-11 §3). Lógica pura, sem zod.

/** Cada PME dura 30 dias a partir do envio (E2). O banco calcula o prazo; aqui só para textos. */
export const PRAZO_PME_DIAS = 30;
/** Números do catálogo: 0 é o de aquecimento (onboarding); os ciclos vão de 1 a 12. */
export const NUMEROS_PME = Array.from({ length: 13 }, (_, n) => n);
export const ULTIMO_PME = 12;

export const CICLO_STATUS = [
  'EM_ANDAMENTO',
  'SEGUNDA_CHANCE',
  'CONCLUIDO',
  'NAO_CONCLUIDO',
] as const;
export type CicloStatus = (typeof CICLO_STATUS)[number];
export const CICLO_STATUS_LABEL: Record<CicloStatus, string> = {
  EM_ANDAMENTO: 'Em andamento',
  SEGUNDA_CHANCE: 'Segunda chance',
  CONCLUIDO: 'Concluído',
  NAO_CONCLUIDO: 'Não concluído',
};

export const TAREFA_ORIGENS = ['REUNIAO', 'PME', 'EXTRA', 'ENCERRAMENTO'] as const;
export type TarefaOrigem = (typeof TAREFA_ORIGENS)[number];
export const TAREFA_ORIGEM_LABEL: Record<TarefaOrigem, string> = {
  REUNIAO: 'Reunião',
  PME: 'PME',
  EXTRA: 'Atividade extra',
  ENCERRAMENTO: 'Encerramento',
};

export const TAREFA_STATUS = ['PENDENTE', 'FEITA', 'PARCIAL', 'NAO_FEITA'] as const;
export type TarefaStatus = (typeof TAREFA_STATUS)[number];
export const TAREFA_STATUS_LABEL: Record<TarefaStatus, string> = {
  PENDENTE: 'Pendente',
  FEITA: 'Feita',
  PARCIAL: 'Parcial',
  NAO_FEITA: 'Não feita',
};
/** O motivo só vale com resultado incompleto; nos demais a API apaga. */
export const tarefaPedeMotivo = (s: TarefaStatus) => s === 'PARCIAL' || s === 'NAO_FEITA';

/** "1º PME", "PME de Aquecimento" ou o título cadastrado. */
export function nomePme(numero: number, titulo?: string | null): string {
  if (titulo) return titulo;
  return numero === 0 ? 'PME de Aquecimento' : `${numero}º PME`;
}

/** Texto da tarefa de encerramento quando o catálogo não tem um próprio. */
export const encerramentoPadrao = (numero: number) => `Encerramento do ${numero}º PME`;
