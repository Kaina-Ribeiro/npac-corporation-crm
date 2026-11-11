// Lógica pura do Acompanhamento sem zod: seguro para componentes de cliente (`@npac/shared/mentoria`).
export * from './enums.js';
export * from './campos.js';
export * from './normalizar.js';
export * from './datas.js';
export * from './links.js';
export * from './dedupe.js';
export * from './dto.js';
export * from './field-queue.js';
export * from './legado.js';
export * from './onboarding.js';
export * from './reunioes.js';
export * from './importacao.js';
export * from './plano.js';
// Pura, sem zod: a ficha grava o telefone já no formato do servidor.
export { normalizePhoneBR } from '../normalize.js';
