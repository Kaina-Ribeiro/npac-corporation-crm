/**
 * Regra única de "quem gerencia quem" (NPAC-54, Fase 2; spec
 * docs/superpowers/specs/2026-11-19-acesso-por-area-design.md, "Regra única"). Função pura, sem zod
 * (legível no cliente: `@npac/shared/areas`). A gêmea em SQL é `area_regra` (migration 0073), e as
 * duas rodam o mesmo arquivo de casos (`packages/shared/test/areas-casos.ts`): mudou uma, mude a
 * outra e o arquivo de casos.
 *
 * Quem faz: a Mestre (Diretoria) faz tudo, menos mexer no próprio cargo. O Head de uma área (Head do
 * Comercial; Admin do Acompanhamento, M2) gerencia só as contas da área dele, nunca dá nem tira Head
 * (D9), nunca mexe em outro Head e, em conta com outra área, só troca o cargo da área dele (M5).
 * Pôr ou tirar alguém de uma área e dar ou tirar Diretoria: só a Mestre (M4).
 */
import type { Alcance } from './alcance.js';
import { AREAS, type Area } from './cargos.js';

/**
 * Vínculo de uma conta numa área (`area_membros`). Cargo nulo = Acompanhamento "falta perfil".
 * `alcance` (Fase 3B) não entra na regra: mudar o alcance é trocar o cargo na área (ação `CARGO`).
 */
export type Vinculo = { area: Area; cargo: string | null; head: boolean; alcance?: Alcance };
/** O que a regra precisa saber de uma conta. */
export type ContaAreas = { mestre: boolean; areas: Vinculo[] };

/**
 * O que se quer fazer:
 * - `VER`: enxergar a conta (lista e qualquer rota sobre ela).
 * - `CONVIDAR`: criar conta com o cargo `area`/`cargo`/`head` (ou `mestre`, a Diretoria).
 * - `VER_PEDIDO`: ver ou recusar um pedido de acesso da área `pedidoArea`.
 * - `APROVAR`: aprovar um pedido da área `pedidoArea` com o cargo `area`/`cargo`/`head`/`mestre`.
 * - `CARGO`: dar ou trocar o cargo do alvo na área `area` (inclui o selo/Head em `head`).
 * - `CONTA`: redefinir senha, zerar MFA ou reativar.
 * - `DESATIVAR`: desativar a conta.
 * - `REMOVER_AREA`: tirar o alvo da área `area`.
 * - `MESTRE`: dar ou tirar a Diretoria.
 */
export const ACOES_AREA = [
  'VER',
  'CONVIDAR',
  'VER_PEDIDO',
  'APROVAR',
  'CARGO',
  'CONTA',
  'DESATIVAR',
  'REMOVER_AREA',
  'MESTRE',
] as const;
export type AcaoArea = (typeof ACOES_AREA)[number];

export type PedidoRegra = {
  ator: ContaAreas;
  /** Conta sobre a qual se age; ausente em `CONVIDAR`, `VER_PEDIDO` e `APROVAR`. */
  alvo?: ContaAreas | null;
  /** O alvo é quem pede. */
  proprio?: boolean;
  acao: AcaoArea;
  /** Área do cargo dado (`CONVIDAR`, `APROVAR`, `CARGO`) ou da qual se tira (`REMOVER_AREA`). */
  area?: Area | null;
  /** Cargo dado; no Comercial, `HEAD` é o Head da área. */
  cargo?: string | null;
  /** Selo de Admin do Acompanhamento (no Comercial vem do cargo). */
  head?: boolean;
  /** Cargo Diretoria (`CONVIDAR`, `APROVAR`). */
  mestre?: boolean;
  /** Área do pedido de acesso (`VER_PEDIDO`, `APROVAR`). */
  pedidoArea?: Area | null;
};

/** INVISIVEL = 404 (não se revela); PROIBIDO = 403 com o motivo; PROPRIO = 400. */
export type ErroRegra = 'INVISIVEL' | 'PROIBIDO' | 'PROPRIO';
export type Veredito = { ok: true } | { ok: false; erro: ErroRegra; motivo: string };

export const REGRA_HTTP: Record<ErroRegra, 400 | 403 | 404> = {
  INVISIVEL: 404,
  PROIBIDO: 403,
  PROPRIO: 400,
};

/** Frases das recusas (as que já existiam antes da Fase 2 ficam iguais). */
export const MOTIVO = {
  PROPRIO: 'Você não pode remover o próprio cargo',
  NEGADO: 'Acesso negado',
  INVISIVEL: 'Não encontrado',
  DAR_HEAD_COMERCIAL: 'Só a Diretoria pode dar cargo de Head ou Diretoria',
  DAR_HEAD_ACOMPANHAMENTO: 'Só a Diretoria dá o selo de Admin do Acompanhamento',
  CARGO_COMERCIAL: 'Só a Diretoria pode dar cargo do Comercial',
  CARGO_ACOMPANHAMENTO: 'Só a Diretoria pode dar cargo de Acompanhamento',
  ADMINISTRA_HEAD_COMERCIAL: 'Só a Diretoria administra contas de Head ou Diretoria',
  ADMINISTRA_HEAD_ACOMPANHAMENTO: 'Só a Diretoria administra contas de Admin do Acompanhamento',
  DUAS_AREAS: 'Conta em mais de uma área: só a Diretoria redefine a senha ou desativa',
  OUTRA_AREA: 'Só a Diretoria põe ou tira alguém de uma área',
} as const;

const DAR_HEAD: Record<Area, string> = {
  COMERCIAL: MOTIVO.DAR_HEAD_COMERCIAL,
  ACOMPANHAMENTO: MOTIVO.DAR_HEAD_ACOMPANHAMENTO,
};
const CARGO_DE: Record<Area, string> = {
  COMERCIAL: MOTIVO.CARGO_COMERCIAL,
  ACOMPANHAMENTO: MOTIVO.CARGO_ACOMPANHAMENTO,
};
const ADMINISTRA_HEAD: Record<Area, string> = {
  COMERCIAL: MOTIVO.ADMINISTRA_HEAD_COMERCIAL,
  ACOMPANHAMENTO: MOTIVO.ADMINISTRA_HEAD_ACOMPANHAMENTO,
};

/** Áreas em que a conta é Head (a Mestre, todas). */
export function areasDeHead(c: ContaAreas): Area[] {
  if (c.mestre) return [...AREAS];
  return AREAS.filter((a) => c.areas.some((v) => v.area === a && v.head));
}

/** Quem tem algum poder de gerenciar contas: a Mestre ou o Head de alguma área. */
export const gerenciaAlguma = (c: ContaAreas) => areasDeHead(c).length > 0;

/** O Head de `heads` enxerga `alvo`: tem vínculo numa dessas áreas e não é a Diretoria. */
const enxerga = (heads: Area[], alvo: ContaAreas) =>
  !alvo.mestre && alvo.areas.some((v) => heads.includes(v.area));

/** Selo pedido: no Comercial o Head é o cargo HEAD; no Acompanhamento, o selo `head`. */
const pedeHead = (area: Area | null | undefined, cargo?: string | null, head?: boolean) =>
  area === 'COMERCIAL' ? cargo === 'HEAD' : head === true;

const ok: Veredito = { ok: true };
const nao = (erro: ErroRegra, motivo: string): Veredito => ({ ok: false, erro, motivo });

export function podeGerenciar(p: PedidoRegra): Veredito {
  const { ator, acao } = p;
  const alvo = p.alvo ?? null;
  const mexeNoCargo =
    acao === 'CARGO' || acao === 'DESATIVAR' || acao === 'REMOVER_AREA' || acao === 'MESTRE';
  if (p.proprio && mexeNoCargo) return nao('PROPRIO', MOTIVO.PROPRIO);
  if (ator.mestre) return ok;

  const heads = areasDeHead(ator);
  if (!heads.length) return nao('PROIBIDO', MOTIVO.NEGADO);

  if (acao === 'VER_PEDIDO')
    return p.pedidoArea && heads.includes(p.pedidoArea) ? ok : nao('INVISIVEL', MOTIVO.INVISIVEL);

  if (acao === 'CONVIDAR' || acao === 'APROVAR') {
    if (acao === 'APROVAR' && !(p.pedidoArea && heads.includes(p.pedidoArea)))
      return nao('INVISIVEL', MOTIVO.INVISIVEL);
    if (!p.area) return nao('PROIBIDO', MOTIVO.NEGADO);
    if (p.mestre) return nao('PROIBIDO', MOTIVO.DAR_HEAD_COMERCIAL);
    if (pedeHead(p.area, p.cargo, p.head)) return nao('PROIBIDO', DAR_HEAD[p.area]);
    // Aprova só com cargo da área do pedido (M9).
    const destino = acao === 'APROVAR' ? p.pedidoArea : p.area;
    if (!heads.includes(p.area) || p.area !== destino) return nao('PROIBIDO', CARGO_DE[p.area]);
    return ok;
  }

  // Daqui em diante a ação é sobre uma conta que existe.
  if (!alvo || !enxerga(heads, alvo)) return nao('INVISIVEL', MOTIVO.INVISIVEL);
  if (acao === 'VER') return ok;

  const alvoHead = alvo.areas.find((v) => v.head);
  // Motivo de "mexer em outro Head": o da área em que ele é Head, se o ator a enxerga.
  const motivoHead =
    alvoHead && heads.includes(alvoHead.area)
      ? ADMINISTRA_HEAD[alvoHead.area]
      : MOTIVO.ADMINISTRA_HEAD_COMERCIAL;

  if (acao === 'CARGO') {
    if (!p.area) return nao('PROIBIDO', MOTIVO.NEGADO);
    if (pedeHead(p.area, p.cargo, p.head)) return nao('PROIBIDO', DAR_HEAD[p.area]);
    if (!heads.includes(p.area)) return nao('PROIBIDO', CARGO_DE[p.area]);
    if (!alvo.areas.some((v) => v.area === p.area)) return nao('PROIBIDO', MOTIVO.OUTRA_AREA);
    if (alvoHead) return nao('PROIBIDO', motivoHead);
    return ok;
  }
  if (acao === 'CONTA' || acao === 'DESATIVAR') {
    if (alvo.areas.length > 1) return nao('PROIBIDO', MOTIVO.DUAS_AREAS);
    if (alvoHead) return nao('PROIBIDO', motivoHead);
    return ok;
  }
  if (acao === 'REMOVER_AREA') return nao('PROIBIDO', MOTIVO.OUTRA_AREA);
  // MESTRE
  return nao('PROIBIDO', MOTIVO.DAR_HEAD_COMERCIAL);
}
