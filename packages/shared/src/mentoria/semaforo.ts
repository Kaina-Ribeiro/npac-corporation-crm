// Check-in, semáforo, status da meta e segunda chance (Fase 2, Parte 3, spec 2026-11-11 E9–E16 e §5).
// Lógica pura, sem zod. A regra do semáforo é do banco (`mentoria_semaforo`); aqui só rótulos.

export const SEMAFORO_CORES = ['VERDE', 'AMARELO', 'VERMELHO'] as const;
export type SemaforoCor = (typeof SEMAFORO_CORES)[number];
export const SEMAFORO_COR_LABEL: Record<SemaforoCor, string> = {
  VERDE: 'Verde',
  AMARELO: 'Amarelo',
  VERMELHO: 'Vermelho',
};

export const SEMAFORO_MOTIVOS = [
  'CHECKIN_1',
  'CHECKIN_2',
  'TAREFA_1',
  'TAREFA_2',
  'PME_7',
  'PME_15',
] as const;
export type SemaforoMotivo = (typeof SEMAFORO_MOTIVOS)[number];
/** Texto do PDF (páginas 17 e 19). */
export const SEMAFORO_MOTIVO_LABEL: Record<SemaforoMotivo, string> = {
  CHECKIN_1: '1 semana sem check-in',
  CHECKIN_2: '2 semanas sem resposta',
  TAREFA_1: 'Tarefa não feita',
  TAREFA_2: '2 tarefas seguidas não feitas',
  PME_7: '7 dias de atraso no PME',
  PME_15: '15 dias de atraso no PME',
};

/** Status da meta (E10): nulo = sem marcação. */
export const META_STATUS = ['ATINGIDA', 'NAO_ATINGIDA'] as const;
export type MetaStatus = (typeof META_STATUS)[number];
export const META_STATUS_LABEL: Record<MetaStatus, string> = {
  ATINGIDA: 'Atingida',
  NAO_ATINGIDA: 'Não atingida',
};

/** Segunda chance (E15): a tela sugere 7 dias (PDF, página 19); a equipe escolhe a data. */
export const SEGUNDA_CHANCE_DIAS = 7;

/** `AAAA-MM-DD` + n dias, no calendário (sem fuso). */
export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Semana de 16/11" a partir da segunda-feira `AAAA-MM-DD`. */
export function rotuloSemana(segunda: string): string {
  const [, m, d] = segunda.split('-');
  return `Semana de ${d}/${m}`;
}
