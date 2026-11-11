import { dataCalendarioValida } from './datas.js';

/** Estados da reunião (§6). REMARCADA só pela ação de remarcar. */
export const REUNIAO_STATUS = [
  'AGENDADA',
  'CONFIRMADA',
  'LINK_ENVIADO',
  'REALIZADA',
  'FALTOU',
  'REMARCADA',
] as const;
export type ReuniaoStatus = (typeof REUNIAO_STATUS)[number];
export const REUNIAO_STATUS_LABEL: Record<ReuniaoStatus, string> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  LINK_ENVIADO: 'Link enviado',
  REALIZADA: 'Realizada',
  FALTOU: 'Faltou',
  REMARCADA: 'Remarcada',
};

/** Em aberto: ainda pode confirmar, enviar o link, remarcar ou registrar o resultado. */
export const REUNIAO_ABERTA: readonly ReuniaoStatus[] = ['AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO'];
const ORDEM: readonly ReuniaoStatus[] = REUNIAO_ABERTA;

export const reuniaoAberta = (s: ReuniaoStatus) => REUNIAO_ABERTA.includes(s);

/**
 * Para onde a reunião pode ir pela tela: adiante na ordem enquanto aberta; REALIZADA e FALTOU só
 * depois do horário. O banco repete a regra (`mentoria_reuniao_guarda`).
 */
export function proximosEstados(atual: ReuniaoStatus, jaComecou: boolean): ReuniaoStatus[] {
  if (!reuniaoAberta(atual)) return [];
  const adiante = ORDEM.slice(ORDEM.indexOf(atual) + 1);
  return jaComecou ? [...adiante, 'REALIZADA', 'FALTOU'] : [...adiante];
}

/** Taxa de comparecimento = REALIZADA ÷ (REALIZADA + FALTOU), em % inteiro; sem base, nulo. */
export function taxaComparecimento(realizadas: number, faltas: number): number | null {
  const base = realizadas + faltas;
  return base === 0 ? null : Math.round((realizadas / base) * 100);
}

export const PLATAFORMAS = ['ZOOM', 'MEET'] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];
export const PLATAFORMA_LABEL: Record<Plataforma, string> = { ZOOM: 'Zoom', MEET: 'Meet' };

export const CANAIS_CONTATO = ['WHATSAPP', 'LIGACAO', 'EMAIL', 'REUNIAO', 'OUTRO'] as const;
export type CanalContato = (typeof CANAIS_CONTATO)[number];
export const CANAL_CONTATO_LABEL: Record<CanalContato, string> = {
  WHATSAPP: 'WhatsApp',
  LIGACAO: 'Ligação',
  EMAIL: 'E-mail',
  REUNIAO: 'Reunião',
  OUTRO: 'Outro',
};

/** Textos do registro, cifrados no banco. */
export const REUNIAO_TEXTOS = [
  'resumo',
  'metas',
  'combinado',
  'cobrar',
  'trava',
  'anotacaoInterna',
] as const;
export type ReuniaoTexto = (typeof REUNIAO_TEXTOS)[number];

/**
 * Campos do registro com a visibilidade ao mentorado da tabela do PDF ("Campos de cada reunião").
 * Interno nunca aparece para ele (Fase 3); a tela marca como interno desde já.
 */
export const CAMPOS_REUNIAO: readonly {
  campo: ReuniaoTexto | 'humor' | 'interesseRenovar' | 'status';
  rotulo: string;
  interno: boolean;
}[] = [
  { campo: 'status', rotulo: 'Status', interno: true },
  { campo: 'resumo', rotulo: 'Resumo do que foi conversado', interno: false },
  { campo: 'metas', rotulo: 'Metas definidas ou ajustadas', interno: false },
  { campo: 'combinado', rotulo: 'Combinado da semana', interno: false },
  { campo: 'cobrar', rotulo: 'O que cobrar na próxima', interno: false },
  { campo: 'trava', rotulo: 'Trava ou dificuldade relatada', interno: true },
  { campo: 'humor', rotulo: 'Humor e engajamento (1 a 5)', interno: true },
  { campo: 'interesseRenovar', rotulo: 'Interesse em renovar', interno: true },
  { campo: 'anotacaoInterna', rotulo: 'Anotação interna', interno: true },
];

/** Dias sem reunião realizada a partir dos quais a inscrição entra na lista (§6). */
export const SEM_REUNIAO_DIAS = 30;

/** `AAAA-MM-DDTHH:mm` de Brasília (o `datetime-local` da tela) que existe de fato. */
export function dataHoraValida(valor: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(valor);
  return !!m && dataCalendarioValida(m[1]!) && +m[2]! < 24 && +m[3]! < 60;
}

/** `AAAA-MM` válido. */
export function mesValido(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(valor);
  return !!m && +m[2]! >= 1 && +m[2]! <= 12;
}
