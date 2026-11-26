// Renovações do Acompanhamento (NPAC-79; Duda 1A, 2C, 3B, 4B, 5A, 6A, 7A, 8A; Gabriel G1–G6). Puro, sem zod: o cliente
// importa por `@npac/shared/renovacoes`, fora do barril `@npac/shared/mentoria` que a casca leva a /leads (teto de
// 150 KB). A lista e os números vêm de `mentoria_renovacoes_painel` (banco); aqui só a situação da conversa, os
// rótulos e as contas.
import type { InscricaoStatus, Mentoria, TipoInscricao } from './enums.js';
import type { ReuniaoStatus } from './reunioes.js';

/** Meses de cada ano da jornada (1A: RDV, 2M e 6M têm ciclo de 12 meses). */
export const MESES_POR_ANO = 12;
/** Quantos dias antes do último mês a ficha entra na lista (PDF: "nos próximos 60 dias"). */
export const DIAS_ANTES_DA_RENOVACAO = 60;
/** Quanto tempo quem renovou fica na lista (G6). */
export const DIAS_RENOVOU_NA_LISTA = 60;

/** Status de onde se renova (G1): Ativo ou Concluído, com término. */
export const STATUS_QUE_RENOVA: readonly InscricaoStatus[] = ['ATIVO', 'CONCLUIDO'];

/** Situação da conversa de renovação (5A), na ordem em que é decidida. */
export const SITUACOES_RENOVACAO = [
  'RENOVOU',
  'QUER_RENOVAR',
  'NAO_QUER',
  'FALTA_RESPOSTA',
  'MARCADA',
  'SEM_REUNIAO',
] as const;
export type SituacaoRenovacao = (typeof SITUACOES_RENOVACAO)[number];

/** Rótulo do filtro (sem data). */
export const SITUACAO_RENOVACAO_LABEL: Record<SituacaoRenovacao, string> = {
  RENOVOU: 'Renovou',
  QUER_RENOVAR: 'Quer renovar',
  NAO_QUER: 'Não quer renovar',
  FALTA_RESPOSTA: 'Reunião feita, falta o “Quer renovar?”',
  MARCADA: 'Reunião marcada',
  SEM_REUNIAO: 'Sem reunião',
};

/** Uma linha da lista "Chegando na renovação". Datas AAAA-MM-DD (dia de Brasília). */
export type RenovacaoLinha = {
  inscricaoId: string;
  nome: string;
  tipo: TipoInscricao;
  mentoria: Mentoria;
  mentoriaVariante: string | null;
  responsavelId: string | null;
  responsavel: string | null;
  inicioJornada: string | null;
  terminoPrevisto: string;
  /** Dia em que começa o último mês do ciclo (término − 1 mês). */
  ultimoMesInicio: string;
  /** Ano da jornada em curso: 1 sem renovação, 2 depois da 1ª… */
  ano: number;
  /** A renovação dos últimos 60 dias (G6), se houver. */
  renovadaEm: string | null;
  renovadaDe: Mentoria | null;
  renovadaPara: Mentoria | null;
  /** A reunião de Renovação mais recente do ciclo atual, sem as remarcadas. */
  reuniaoStatus: ReuniaoStatus | null;
  reuniaoDia: string | null;
  interesseRenovar: boolean | null;
  /** Calculados pela API com as funções abaixo. */
  situacao: SituacaoRenovacao;
  situacaoRotulo: string;
  mesRotulo: string;
};

export type NumerosRenovacao = {
  /** Na lista sem renovação registrada. */
  chegando: number;
  /** Desses, com a reunião de renovação realizada. */
  jaTiveramReuniao: number;
  /** Renovações registradas nos últimos 12 meses (G4). */
  renovaram: number;
  /** Fichas marcadas "Concluído" nos últimos 12 meses (G4). */
  naoRenovaram: number;
  /** Renovaram ÷ (Renovaram + Não renovaram), inteiro; nulo sem base ("—"). */
  pct: number | null;
};

export type PainelRenovacoes = { hoje: string; numeros: NumerosRenovacao; itens: RenovacaoLinha[] };

/** A renovação na ficha (a mais antiga primeiro). */
export type RenovacaoDTO = {
  id: string;
  ano: number;
  data: string;
  mentoriaAnterior: Mentoria;
  mentoriaNova: Mentoria;
  terminoAnterior: string;
  terminoNovo: string;
  registradaPor: string | null;
};

/** "26/11" de "2026-11-26". */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

type BaseSituacao = Pick<
  RenovacaoLinha,
  'renovadaEm' | 'renovadaDe' | 'renovadaPara' | 'reuniaoStatus' | 'reuniaoDia' | 'interesseRenovar'
>;

/** Situação da conversa (5A) e o texto da linha. */
export function situacaoConversa(l: BaseSituacao): { situacao: SituacaoRenovacao; rotulo: string } {
  if (l.renovadaEm) {
    const troca =
      l.renovadaPara && l.renovadaPara !== l.renovadaDe ? ` para ${l.renovadaPara}` : '';
    return { situacao: 'RENOVOU', rotulo: `Renovou${troca} em ${diaMes(l.renovadaEm)}` };
  }
  if (l.reuniaoStatus === 'REALIZADA') {
    if (l.interesseRenovar === true) return { situacao: 'QUER_RENOVAR', rotulo: 'Quer renovar' };
    if (l.interesseRenovar === false) return { situacao: 'NAO_QUER', rotulo: 'Não quer renovar' };
    return { situacao: 'FALTA_RESPOSTA', rotulo: SITUACAO_RENOVACAO_LABEL.FALTA_RESPOSTA };
  }
  if (
    l.reuniaoDia &&
    (l.reuniaoStatus === 'AGENDADA' ||
      l.reuniaoStatus === 'CONFIRMADA' ||
      l.reuniaoStatus === 'LINK_ENVIADO')
  )
    return { situacao: 'MARCADA', rotulo: `Reunião marcada para ${diaMes(l.reuniaoDia)}` };
  if (l.reuniaoStatus === 'FALTOU' && l.reuniaoDia)
    return { situacao: 'SEM_REUNIAO', rotulo: `Sem reunião · faltou em ${diaMes(l.reuniaoDia)}` };
  return { situacao: 'SEM_REUNIAO', rotulo: 'Sem reunião' };
}

/** Total de meses da jornada com `renovacoes` renovações: 12, 24, 36… */
export function mesesDaJornada(renovacoes: number): number {
  return MESES_POR_ANO * (renovacoes + 1);
}

/** "Mês 12 de 12", "O 12º mês começa em DD/MM" ou "Terminou em DD/MM" (passou do término sem resolver). */
export function rotuloMesRenovacao(
  l: Pick<RenovacaoLinha, 'ano' | 'terminoPrevisto' | 'ultimoMesInicio'>,
  hoje: string,
): string {
  const ultimo = MESES_POR_ANO * l.ano;
  if (hoje > l.terminoPrevisto) return `Terminou em ${diaMes(l.terminoPrevisto)}`;
  if (hoje >= l.ultimoMesInicio) return `Mês ${ultimo} de ${ultimo}`;
  return `O ${ultimo}º mês começa em ${diaMes(l.ultimoMesInicio)}`;
}

/** % de renovação (8A): inteiro arredondado; nulo sem base. */
export function pctRenovacao(renovaram: number, naoRenovaram: number): number | null {
  const base = renovaram + naoRenovaram;
  return base === 0 ? null : Math.round((renovaram * 100) / base);
}

/** Os cinco números do topo (8A), sobre a lista inteira (o filtro não muda os números). */
export function numerosRenovacao(
  itens: readonly Pick<RenovacaoLinha, 'situacao' | 'reuniaoStatus'>[],
  renovaram: number,
  naoRenovaram: number,
): NumerosRenovacao {
  const chegando = itens.filter((i) => i.situacao !== 'RENOVOU');
  return {
    chegando: chegando.length,
    jaTiveramReuniao: chegando.filter((i) => i.reuniaoStatus === 'REALIZADA').length,
    renovaram,
    naoRenovaram,
    pct: pctRenovacao(renovaram, naoRenovaram),
  };
}

export type FiltroRenovacoes = { situacao?: SituacaoRenovacao; responsavelId?: string };

/** Filtros da aba (situação da conversa e responsável). */
export function filtrarRenovacoes<T extends Pick<RenovacaoLinha, 'situacao' | 'responsavelId'>>(
  itens: readonly T[],
  f: FiltroRenovacoes,
): T[] {
  return itens.filter(
    (i) =>
      (!f.situacao || i.situacao === f.situacao) &&
      (!f.responsavelId || i.responsavelId === f.responsavelId),
  );
}
