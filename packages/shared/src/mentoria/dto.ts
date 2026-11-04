import type { MentoradoStatus } from './enums.js';

/** Linha do Dashboard (Módulo 1), como a API devolve. */
export type MentoradoItem = {
  id: string;
  nome: string;
  tipoCadastro: string | null;
  tipoMentoria: string | null;
  dataEntradaTexto: string | null;
  dataEntrada: string | null;
  status: MentoradoStatus;
  version: number;
  pessoaRef: string | null;
};

/** Página da lista: 50 itens e cursor opaco (só o id do último, assinado). */
export type PaginaMentorados = { itens: MentoradoItem[]; cursor: string | null };
