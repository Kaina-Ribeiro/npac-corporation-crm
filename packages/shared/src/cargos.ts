/**
 * Cargo em um passo (spec 2026-11-11-cargos-design): um campo só, agrupado por área. Os cargos do
 * Acompanhamento gravam `role = ACOMPANHAMENTO` + o perfil do módulo (`mentoria_perfis`). Sem zod:
 * legível no cliente (`@npac/shared/cargos`). Fonte única dos rótulos e dicas do Admin, pedido de
 * acesso, Mais e Equipe.
 */
import { isLeader, type Role } from './enums.js';
import type { Perfil } from './mentoria/enums.js';

export const CARGOS = [
  'SDR',
  'CLOSER',
  'HEAD',
  'DIRETOR',
  'ACOMPANHAMENTO',
  'OPERACAO',
  'ESPECIALISTA',
  'MENTOR',
] as const;
export type Cargo = (typeof CARGOS)[number];

export const AREAS = ['COMERCIAL', 'ACOMPANHAMENTO'] as const;
export type Area = (typeof AREAS)[number];
export const AREA_LABEL: Record<Area, string> = {
  COMERCIAL: 'Comercial',
  ACOMPANHAMENTO: 'Acompanhamento',
};

export type CargoInfo = {
  label: string;
  area: Area;
  role: Role;
  perfil: Perfil | null;
  dica: string;
};

export const CARGO_INFO: Record<Cargo, CargoInfo> = {
  SDR: {
    label: 'SDR',
    area: 'COMERCIAL',
    role: 'SDR',
    perfil: null,
    dica: 'Cadastra e trabalha os próprios leads e agenda reuniões. Não vê valores de venda.',
  },
  CLOSER: {
    label: 'Closer',
    area: 'COMERCIAL',
    role: 'CLOSER',
    perfil: null,
    dica: 'Faz as reuniões e registra vendas e pagamentos.',
  },
  HEAD: {
    label: 'Head',
    area: 'COMERCIAL',
    role: 'HEAD',
    perfil: null,
    dica: 'Vê e gerencia todo o comercial. Administra SDRs e Closers.',
  },
  DIRETOR: {
    label: 'Diretoria',
    area: 'COMERCIAL',
    role: 'DIRETOR',
    perfil: null,
    dica: 'Tudo do Head. Dá cargos de liderança e é Admin do Acompanhamento.',
  },
  ACOMPANHAMENTO: {
    label: 'Acompanhamento',
    area: 'ACOMPANHAMENTO',
    role: 'ACOMPANHAMENTO',
    perfil: 'ACOMPANHAMENTO',
    dica: 'Cuida da jornada de todos os mentorados.',
  },
  OPERACAO: {
    label: 'Operação',
    area: 'ACOMPANHAMENTO',
    role: 'ACOMPANHAMENTO',
    perfil: 'OPERACAO',
    dica: 'Cadastra inscrições, onboarding, Caixa e agenda de reuniões.',
  },
  ESPECIALISTA: {
    label: 'Especialista',
    area: 'ACOMPANHAMENTO',
    role: 'ACOMPANHAMENTO',
    perfil: 'ESPECIALISTA',
    dica: 'Vê só os mentorados das reuniões que conduz.',
  },
  MENTOR: {
    label: 'Mentor',
    area: 'ACOMPANHAMENTO',
    role: 'ACOMPANHAMENTO',
    perfil: 'MENTOR',
    dica: 'Aparece como condutor das reuniões. Ainda sem acesso: o painel chega depois.',
  },
};

export const CARGOS_POR_AREA: Record<Area, Cargo[]> = {
  COMERCIAL: CARGOS.filter((c) => CARGO_INFO[c].area === 'COMERCIAL'),
  ACOMPANHAMENTO: CARGOS.filter((c) => CARGO_INFO[c].area === 'ACOMPANHAMENTO'),
};

/** Selo do módulo: sempre com o nome inteiro (C5). */
export const MODULO_ADMIN_LABEL = 'Admin do Acompanhamento';

/** Caixas da liderança (C3): rótulo e dica de cada uma. */
export const ATUA_COMO = {
  canProspect: { label: 'Atua como SDR', dica: 'Pode ser dono de leads.' },
  canClose: { label: 'Atua como Closer', dica: 'Aparece nas listas de closer.' },
} as const;

/** Cargo na tela a partir do que está gravado. Acompanhamento sem perfil (conta antiga): `null`. */
export function cargoDe(role: Role, perfil: Perfil | null | undefined): Cargo | null {
  if (role !== 'ACOMPANHAMENTO') return role;
  return perfil ?? null;
}

/** Só Head e Diretoria escolhem "Atua como SDR/Closer" (C3). */
export const temCaixas = (role: Role) => isLeader(role);

type Caixas = { canProspect: boolean; canClose: boolean };

/** Caixas que o próprio cargo define (C4); `null` = liderança, que escolhe. */
export function caixasFixas(role: Role): Caixas | null {
  if (role === 'SDR') return { canProspect: true, canClose: false };
  if (role === 'CLOSER') return { canProspect: false, canClose: true };
  if (role === 'ACOMPANHAMENTO') return { canProspect: false, canClose: false };
  return null;
}

export type CargoPedido = {
  role: Role;
  perfil?: Perfil;
  moduloAdmin?: boolean;
  canProspect?: boolean;
  canClose?: boolean;
};
export type CargoGravado = Caixas & { role: Role; perfil: Perfil | null; moduloAdmin: boolean };
export type CargoErro = 'OPCAO_INVALIDA' | 'PERFIL_OBRIGATORIO';
export type CargoResultado = { ok: true; valor: CargoGravado } | { ok: false; erro: CargoErro };

/** Mensagens da API para cada recusa do resolvedor. */
export const CARGO_ERRO_MSG: Record<CargoErro, string> = {
  OPCAO_INVALIDA: 'Esse cargo não aceita essa opção',
  PERFIL_OBRIGATORIO: 'Escolha o perfil do Acompanhamento',
};

/**
 * Regras de gravação do cargo (spec, "Regras de gravação" 1–3). `atual` = o que a pessoa tem hoje
 * (troca de cargo); sem ele, conta nova.
 */
export function resolverCargo(pedido: CargoPedido, atual?: CargoGravado): CargoResultado {
  const { role } = pedido;
  const acomp = role === 'ACOMPANHAMENTO';
  if (!acomp && (pedido.perfil !== undefined || pedido.moduloAdmin !== undefined))
    return { ok: false, erro: 'OPCAO_INVALIDA' };

  const fixas = caixasFixas(role);
  let caixas: Caixas;
  if (fixas) {
    if (
      (pedido.canProspect !== undefined && pedido.canProspect !== fixas.canProspect) ||
      (pedido.canClose !== undefined && pedido.canClose !== fixas.canClose)
    )
      return { ok: false, erro: 'OPCAO_INVALIDA' };
    caixas = fixas;
  } else {
    caixas = {
      canProspect: pedido.canProspect ?? atual?.canProspect ?? false,
      canClose: pedido.canClose ?? atual?.canClose ?? false,
    };
  }

  if (!acomp) return { ok: true, valor: { role, ...caixas, perfil: null, moduloAdmin: false } };

  const continua = atual?.role === 'ACOMPANHAMENTO';
  const perfil = pedido.perfil ?? (continua ? atual.perfil : null);
  if (!perfil) return { ok: false, erro: 'PERFIL_OBRIGATORIO' };
  const moduloAdmin = pedido.moduloAdmin ?? (continua ? atual.moduloAdmin : false);
  return { ok: true, valor: { role, ...caixas, perfil, moduloAdmin } };
}
