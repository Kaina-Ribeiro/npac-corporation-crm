/** Mensagens-modelo e WhatsApp (SPEC §4, §6, D9). O texto nunca vai no link: o botão copia. */
import type { TipoInscricao } from './enums.js';
import type { FilaTipo } from './fila.js';
import type { Etapa } from './onboarding.js';

export const MOMENTOS_MENSAGEM = [
  'BOAS_VINDAS',
  'PASSO_1',
  'PASSO_2',
  'PASSO_3',
  'LEMBRETE_IDR',
  'EVENTO',
  'OUTRO',
] as const;
export type MomentoMensagem = (typeof MOMENTOS_MENSAGEM)[number];

export type MensagemModelo = {
  momento: MomentoMensagem;
  nome: string;
  textoIndividual: string;
  textoCasal: string;
  version: number;
};

export type PessoaMensagem = { nome: string; apelido: string | null };

/** Como a pessoa gosta de ser chamada: o apelido, ou o primeiro nome. */
export function chamar(p: PessoaMensagem): string {
  const apelido = p.apelido?.trim();
  if (apelido) return apelido;
  return p.nome.trim().split(/\s+/)[0] ?? '';
}

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** `{nome}` = a primeira pessoa; `{nomes}` = todas ("Ana e Bia"). */
export function renderMensagem(texto: string, pessoas: readonly PessoaMensagem[]): string {
  const nomes = pessoas.map(chamar).filter(Boolean);
  return texto.replaceAll('{nomes}', juntar(nomes)).replaceAll('{nome}', nomes[0] ?? '');
}

const MOMENTO_DA_ETAPA: Partial<Record<Etapa, MomentoMensagem>> = {
  BOAS_VINDAS: 'BOAS_VINDAS',
  GRUPOS: 'PASSO_1',
  AQUECIMENTO: 'PASSO_2',
  PME_AQUECIMENTO: 'PASSO_3',
};

/** Qual mensagem o item da Fila oferece; nulo se não houver mensagem ao mentorado. */
export function momentoDoItem(tipo: FilaTipo, etapa: Etapa | null): MomentoMensagem | null {
  if (tipo === 'LEMBRETE_IDR') return 'LEMBRETE_IDR';
  if (tipo === 'BOAS_VINDAS') return 'BOAS_VINDAS';
  if ((tipo === 'PASSO_DEVIDO' || tipo === 'PARADO') && etapa)
    return MOMENTO_DA_ETAPA[etapa] ?? null;
  return null;
}

/** O texto pronto para a inscrição: a versão casal quando houver, senão a individual. */
export function textoPronto(
  modelo: Pick<MensagemModelo, 'textoIndividual' | 'textoCasal'> | undefined,
  tipo: TipoInscricao,
  pessoas: readonly PessoaMensagem[],
): string | null {
  if (!modelo) return null;
  const casal = tipo === 'CASAL' ? modelo.textoCasal.trim() : '';
  const texto = casal || modelo.textoIndividual.trim();
  return texto ? renderMensagem(texto, pessoas) : null;
}

/**
 * Conversa no WhatsApp sem texto (D9): `https://wa.me/<dígitos>`. Nulo sem número válido, e o
 * botão some em vez de abrir um link vazio (Review Focus 4).
 */
export function linkWhatsApp(numero: string | null | undefined): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 15 ? `https://wa.me/${digitos}` : null;
}

/** Só o convite do grupo do WhatsApp abre como "Grupo". */
export const linkGrupoValido = (link: string | null | undefined): string | null =>
  link && link.startsWith('https://chat.whatsapp.com/') ? link : null;
