import { systemClock, type Clock } from '../push/reminders.js';

/** Relógio do módulo (Fila do dia e avisos), trocável nos testes. Padrão: o do Node. */
export const MENTORIA_CLOCK = Symbol('MENTORIA_CLOCK');
export { systemClock, type Clock };
