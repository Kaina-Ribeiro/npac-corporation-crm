/**
 * Textos do acesso por área (NPAC-54, Fase 3): "entrou há X" (D12) e as frases do registro de
 * acessos da Diretoria (D10, D11). Sem zod: lido no cliente
 * (`@npac/shared/acessos`).
 */
import { ALCANCE_LABEL, type Alcance } from './alcance.js';
import { AREA_LABEL, CARGO_INFO, MODULO_ADMIN_LABEL, type Area, type Cargo } from './cargos.js';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Dia do calendário de Brasília (AAAA-MM-DD) de um instante. */
const diaBrasilia = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/** Dias de calendário (Brasília) entre dois instantes. */
const diasEntre = (antes: Date, depois: Date) =>
  Math.round((Date.parse(diaBrasilia(depois)) - Date.parse(diaBrasilia(antes))) / DIA);

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Última vez que a pessoa usou o sistema (`ultimoUso` de GET admin/users; M12), em português:
 * minutos e horas até 24 h; depois, dias de calendário de Brasília ("ontem", até 6 dias "entrou há",
 * a partir de 7 "não entra há").
 */
export function entrouHa(ultimoUso: string | null, agora: Date = new Date()): string {
  if (!ultimoUso) return 'nunca entrou';
  const uso = new Date(ultimoUso);
  const ms = agora.getTime() - uso.getTime();
  if (ms < MIN) return 'entrou agora';
  if (ms < HORA) return `entrou há ${plural(Math.floor(ms / MIN), 'minuto', 'minutos')}`;
  if (ms < DIA) return `entrou há ${plural(Math.floor(ms / HORA), 'hora', 'horas')}`;
  const dias = Math.max(1, diasEntre(uso, agora));
  if (dias === 1) return 'entrou ontem';
  if (dias < 7) return `entrou há ${dias} dias`;
  return `não entra há ${dias} dias`;
}

// ------------------------------------------------------------------ registro de acessos (D10, D11)

/** Tipos do registro (`GET admin/acessos`, `api/admin/acessos.ts`). */
export const TIPOS_ACESSO = [
  'CONTA_CRIADA',
  'PEDIDO_APROVADO',
  'PEDIDO_RECUSADO',
  'CARGO_TROCADO',
  'HEAD_DADO',
  'HEAD_TIRADO',
  'AREA_ADICIONADA',
  'AREA_REMOVIDA',
  'DIRETORIA_DADA',
  'DIRETORIA_TIRADA',
  'SENHA_REDEFINIDA',
  'MFA_ZERADO',
  'CONTA_DESATIVADA',
  'CONTA_REATIVADA',
  /** Evento antigo (antes da Fase 2): ativou ou desativou, sem dizer qual. */
  'CONTA_ATIVO_ALTERADO',
] as const;
export type TipoAcesso = (typeof TIPOS_ACESSO)[number];

export type Acesso = {
  id: number;
  at: string;
  tipo: TipoAcesso;
  ator: { id: string; nome: string } | null;
  alvo: { id: string; nome: string } | null;
  /** Área e cargo (chaves de `AREAS` e `CARGOS`, `cargos.ts`); nulos em evento antigo. */
  area: string | null;
  cargo: string | null;
  head: boolean | null;
  /**
   * Fase 3B: a tag de "Acessos" que entrou com o cargo ("Carteira"), ou "Todos os mentorados" quando a
   * pessoa saiu da carteira; ausente = sem tag.
   */
  alcance?: Alcance | null;
};

/**
 * Frase de uma linha, em três pedaços: o nome do alvo fica em destaque na tela. `tag`: a tag de
 * "Acessos" ao lado da frase ("Carteira"/"Todos os mentorados"), como na lista de pessoas.
 */
export type FraseAcesso = {
  antes: string;
  alvo: string | null;
  depois: string;
  tag: string | null;
};

const areaLabel = (a: string | null) => (a && a in AREA_LABEL ? AREA_LABEL[a as Area] : null);
const cargoLabel = (c: string | null) =>
  c && c in CARGO_INFO ? CARGO_INFO[c as Cargo].label : null;

/** " · Área, Cargo" (D11); Admin do Acompanhamento junto do cargo; Diretoria sem área. */
function sufixo(a: Acesso) {
  const area = areaLabel(a.area);
  let cargo = cargoLabel(a.cargo);
  if (cargo && a.area === 'ACOMPANHAMENTO' && a.head) cargo = `${cargo} e ${MODULO_ADMIN_LABEL}`;
  const partes = [area, cargo].filter(Boolean);
  return partes.length ? ` · ${partes.join(', ')}` : '';
}

/** Nome do Head da área: "Head" no Comercial, o selo no Acompanhamento (M3). */
const nomeDoHead = (area: string | null) =>
  area === 'ACOMPANHAMENTO' ? MODULO_ADMIN_LABEL : 'Head';

/**
 * Frase do registro de acessos (spec, "Registro de acessos da Diretoria"; textos aprovados em D13).
 * Quem fez é "Você" quando é quem lê; conta apagada vira "uma conta apagada".
 */
/** Tipos em que a frase leva o cargo (" · Área, Cargo") e, com ele, a tag de "Acessos". */
const COM_CARGO = new Set<TipoAcesso>([
  'CONTA_CRIADA',
  'PEDIDO_APROVADO',
  'CARGO_TROCADO',
  'AREA_ADICIONADA',
]);

export function fraseAcesso(a: Acesso, euId: string): FraseAcesso {
  const tag = a.alcance && COM_CARGO.has(a.tipo) ? ALCANCE_LABEL[a.alcance] : null;
  return { ...frase(a, euId), tag };
}

function frase(a: Acesso, euId: string): Omit<FraseAcesso, 'tag'> {
  const ator = !a.ator ? 'Uma conta apagada' : a.ator.id === euId ? 'Você' : a.ator.nome;
  const alvo = a.alvo?.nome ?? 'uma conta apagada';
  const f = (verbo: string, depois = '') => ({ antes: `${ator} ${verbo} `, alvo, depois });
  switch (a.tipo) {
    case 'CONTA_CRIADA':
      return f('criou a conta de', sufixo(a));
    case 'PEDIDO_APROVADO':
      return f('aprovou o pedido de', sufixo(a));
    case 'PEDIDO_RECUSADO': {
      const area = areaLabel(a.area);
      return {
        antes: `${ator} recusou um pedido de acesso${area ? ` · ${area}` : ''}`,
        alvo: null,
        depois: '',
      };
    }
    case 'CARGO_TROCADO':
      return f('trocou o cargo de', sufixo(a));
    case 'HEAD_DADO':
      return f(`deu ${nomeDoHead(a.area)} a`);
    case 'HEAD_TIRADO':
      return f(`tirou ${nomeDoHead(a.area)} de`);
    case 'AREA_ADICIONADA':
      return f('adicionou', ` a outra área${sufixo(a)}`);
    case 'AREA_REMOVIDA': {
      const area = areaLabel(a.area);
      return f('tirou', area ? ` do ${area}` : ' de uma área');
    }
    case 'DIRETORIA_DADA':
      return f('deu Diretoria a');
    case 'DIRETORIA_TIRADA':
      return f('tirou a Diretoria de', sufixo(a));
    case 'SENHA_REDEFINIDA':
      return f('redefiniu a senha de');
    case 'MFA_ZERADO':
      return f('resetou o MFA de');
    case 'CONTA_DESATIVADA':
      return f('desativou a conta de');
    case 'CONTA_REATIVADA':
      return f('reativou a conta de');
    default:
      return f('alterou a conta de');
  }
}

/** Data curta da linha: "hoje 14:02", "ontem 09:10" ou "17/11" (Brasília). */
export function quandoAcesso(at: string, agora: Date = new Date()): string {
  const d = new Date(at);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  const dias = diasEntre(d, agora);
  if (dias <= 0) return `hoje ${hora}`;
  if (dias === 1) return `ontem ${hora}`;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}
