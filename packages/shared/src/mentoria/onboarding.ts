/** Onboarding (SPEC §5): seis etapas, ordem dos passos de mensagem e prazos dos alertas. */

export const ETAPAS = [
  'BOAS_VINDAS',
  'GRUPOS',
  'AQUECIMENTO',
  'PME_AQUECIMENTO',
  'CAIXA',
  'IDR',
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_LABEL: Record<Etapa, string> = {
  BOAS_VINDAS: 'Boas-vindas',
  GRUPOS: 'Grupos de WhatsApp',
  AQUECIMENTO: 'Aquecimento da Riqueza',
  PME_AQUECIMENTO: 'PME de aquecimento',
  CAIXA: 'Caixa da Verdadeira Riqueza',
  IDR: 'Reunião de IDR',
};

export const PASSOS_MENSAGEM = [
  'BOAS_VINDAS',
  'GRUPOS',
  'AQUECIMENTO',
  'PME_AQUECIMENTO',
] as const satisfies readonly Etapa[];

export const ETAPA_STATUS = [
  'PENDENTE',
  'ENVIADA',
  'CONCLUIDA',
  'DISPENSADA',
  'ANTERIOR_AO_SISTEMA',
] as const;
export type EtapaStatus = (typeof ETAPA_STATUS)[number];

export const ETAPA_STATUS_LABEL: Record<EtapaStatus, string> = {
  PENDENTE: 'Pendente',
  ENVIADA: 'Enviada',
  CONCLUIDA: 'Concluída',
  DISPENSADA: 'Dispensada',
  ANTERIOR_AO_SISTEMA: 'Antes do sistema',
};

export const ENVIO_STATUS = ['PREPARANDO', 'ENVIADO', 'ENTREGUE'] as const;
export type EnvioStatus = (typeof ENVIO_STATUS)[number];

export const ENVIO_STATUS_LABEL: Record<EnvioStatus, string> = {
  PREPARANDO: 'Preparando',
  ENVIADO: 'Enviada',
  ENTREGUE: 'Entregue',
};

/** Dias antes do alerta: "mais de N" (SPEC §5, D15). */
export const PRAZOS = {
  PASSO_CURTO_DIAS: 3,
  CAIXA_SEM_ENVIO_DIAS: 3,
  CAIXA_TRANSITO_DIAS: 20,
} as const;

/** Campos que cada etapa guarda além do status (PDF, coluna "O que o sistema registra"). */
export const CAMPOS_ETAPA = {
  BOAS_VINDAS: ['grupoCriadoEm', 'formularioPreenchido'],
  GRUPOS: ['grupoAvisos', 'grupoClube', 'grupoNacao'],
  AQUECIMENTO: ['aulasConcluidas', 'aulasConcluidasEm'],
  PME_AQUECIMENTO: [],
  CAIXA: [],
  IDR: [],
} as const satisfies Record<Etapa, readonly string[]>;

export type EtapaEstado = {
  etapa: Etapa;
  status: EtapaStatus;
  formularioPreenchido?: boolean | null;
};

/** Etapa fora do caminho: concluída, dispensada ou anterior ao sistema. */
export const etapaFechada = (status: EtapaStatus) =>
  status === 'CONCLUIDA' || status === 'DISPENSADA' || status === 'ANTERIOR_AO_SISTEMA';

const estado = (etapas: readonly EtapaEstado[], etapa: Etapa) =>
  etapas.find((e) => e.etapa === etapa);

/**
 * A etapa pode andar agora? Passos de mensagem seguem em ordem; a Caixa corre em paralelo e pede
 * só o formulário (dispensado, ou anterior ao sistema, não há formulário a esperar); a IDR espera
 * a Caixa entregue ou dispensada.
 */
export function podeEnviar(etapa: Etapa, etapas: readonly EtapaEstado[]): boolean {
  if (etapa === 'CAIXA') {
    const boas = estado(etapas, 'BOAS_VINDAS');
    return (
      boas?.status === 'DISPENSADA' ||
      boas?.status === 'ANTERIOR_AO_SISTEMA' ||
      boas?.formularioPreenchido === true
    );
  }
  if (etapa === 'IDR') {
    const caixa = estado(etapas, 'CAIXA');
    return !!caixa && etapaFechada(caixa.status);
  }
  const i = PASSOS_MENSAGEM.indexOf(etapa);
  if (i <= 0) return true;
  const anterior = estado(etapas, PASSOS_MENSAGEM[i - 1]!);
  return !!anterior && etapaFechada(anterior.status);
}

/** Onde a inscrição está parada: o primeiro passo em aberto, nulo se tudo fechou. */
export function etapaAtual(etapas: readonly EtapaEstado[]): Etapa | null {
  for (const nome of ETAPAS) {
    const e = estado(etapas, nome);
    if (e && !etapaFechada(e.status)) return nome;
  }
  return null;
}

const DIA_MS = 86_400_000;

/** Número do dia de calendário em Brasília (mesma data = mesmo número). */
function diaBrasilia(d: Date): number {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .split('-')
    .map(Number);
  return Date.UTC(ano!, mes! - 1, dia!) / DIA_MS;
}

/** Dias de calendário em Brasília desde `desde`; nunca negativo. */
export function diasParado(desde: Date | string, agora: Date): number {
  return Math.max(0, diaBrasilia(agora) - diaBrasilia(new Date(desde)));
}

/**
 * Passou do prazo? Passos curtos e a equipe devendo o próximo passo: 3 dias. O PME de aquecimento
 * enviado corre junto com a Caixa e não alerta sozinho. Caixa sem envio: 3 dias; em trânsito: 20.
 */
export function etapaEmAlerta(etapa: Etapa, status: EtapaStatus, dias: number): boolean {
  if (etapaFechada(status) || etapa === 'IDR') return false;
  if (etapa === 'CAIXA')
    return dias > (status === 'ENVIADA' ? PRAZOS.CAIXA_TRANSITO_DIAS : PRAZOS.CAIXA_SEM_ENVIO_DIAS);
  if (etapa === 'PME_AQUECIMENTO' && status === 'ENVIADA') return false;
  return dias > PRAZOS.PASSO_CURTO_DIAS;
}
