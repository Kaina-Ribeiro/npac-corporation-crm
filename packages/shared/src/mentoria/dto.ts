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

/** Primeira página do Dashboard: também os números dos cards e das etiquetas. */
export type ResumoDashboard = PaginaMentorados & {
  total: number;
  contagemPorStatus: Record<MentoradoStatus, number>;
  contagemPorMentoria: { nome: string; n: number }[];
  nomesPorStatus: Record<MentoradoStatus, { id: string; nome: string }[]>;
};

export type MidiaDTO = {
  id: string;
  donoTipo: string;
  donoId: string;
  tipo: 'FOTO' | 'VIDEO' | 'PDF' | 'LINK_VIDEO';
  urlVideo: string | null;
  mime: string | null;
  tamanhoBytes: number | null;
};

/** Linha da lista de fichas (Módulo 2). */
export type FichaItem = {
  id: string;
  nome: string;
  dataInicioTexto: string | null;
  tempoMentoria: string | null;
  conquistas: number;
};
export type PaginaFichas = { itens: FichaItem[]; cursor: string | null; total?: number };

export type CampoFicha = {
  chave: string;
  rotulo: string;
  antes: string | null;
  depois: string | null;
};

/** Ficha aberta: textos decifrados, 4 pilares e 5 evoluções sempre nas linhas fixas. */
export type FichaDetalhe = {
  id: string;
  nome: string;
  dataInicioTexto: string | null;
  notasMomentoInicial: string | null;
  notasMomentoAtual: string | null;
  tempoMentoria: string | null;
  version: number;
  pessoaRef: string | null;
  pilares: CampoFicha[];
  evolucao: CampoFicha[];
  conquistas: { id: string; data: string | null; descricao: string | null }[];
  midias: MidiaDTO[];
};

/** Linha da lista do RDV (Módulo 3). */
export type RdvItem = { id: string; nome: string; eventos: number };
export type PaginaRdv = { itens: RdvItem[]; cursor: string | null; total?: number };

/** Campo do diagnóstico colado (só leitura na tela). */
export type DiagnosticoCampo = { chave: string; rotulo: string; valor: string | null };

/** Prévia de "Colar dados do diagnóstico": nada é gravado (D30). */
export type DiagnosticoPrevia = {
  campos: { chave: string; rotulo: string; atual: string | null; novo: string }[];
  faltam: string[];
  desconhecidos: number;
};

/** Pessoa do RDV aberta: cabeçalho, diagnóstico, pasta e mídias (foto de perfil). */
export type RdvDetalhe = {
  id: string;
  nome: string;
  version: number;
  pessoaRef: string | null;
  pastaUrl: string | null;
  diagnostico: DiagnosticoCampo[];
  /** Em ordem cronológica (data, id), calculada na leitura (regra 4). */
  eventos: { id: string; data: string; descricao: string | null }[];
  /** Itens dos 4 quadros, em ordem (data, id); sem data no fim (D34). */
  quadros: { id: string; quadro: string; data: string | null; descricao: string | null }[];
  midias: MidiaDTO[];
};
