import type { Perfil } from './enums.js';

/** Tipos de reunião do SPEC (§4). A aba Reuniões usa os mesmos. */
export const REUNIAO_TIPOS = [
  'IDR',
  'ACOMP_2PME',
  'POSICIONAMENTO',
  'MENTORADO_EXPERIENTE',
  'CARTOES_MILHAS',
  'MENSAL_6M',
  'TRIMESTRAL_2M',
  'ACOMP_EMERGENCIA',
  'RENOVACAO',
] as const;
export type ReuniaoTipo = (typeof REUNIAO_TIPOS)[number];
export const REUNIAO_TIPO_LABEL: Record<ReuniaoTipo, string> = {
  IDR: 'IDR',
  ACOMP_2PME: 'Acompanhamento do 2º PME',
  POSICIONAMENTO: 'Posicionamento',
  MENTORADO_EXPERIENTE: 'Mentorado experiente',
  CARTOES_MILHAS: 'Cartões e milhas',
  MENSAL_6M: 'Mensal do 6M',
  TRIMESTRAL_2M: 'Trimestral do 2M',
  ACOMP_EMERGENCIA: 'Acompanhamento de emergência',
  RENOVACAO: 'Renovação',
};

export const GATILHOS = ['INICIO_MES', 'FIM_PME', 'FLEXIVEL'] as const;
export type Gatilho = (typeof GATILHOS)[number];
export const GATILHO_LABEL: Record<Gatilho, string> = {
  INICIO_MES: 'Início do mês',
  FIM_PME: 'Fim do PME',
  FLEXIVEL: 'Flexível',
};

export const ACAO_STATUS = ['PENDENTE', 'FEITA'] as const;
export type AcaoStatus = (typeof ACAO_STATUS)[number];

/** Perfis que respondem por uma ação. O Mentor não tem acesso na Fase 1 (D14). */
export const PERFIS_ACAO = ['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'] as const;
export type PerfilAcao = Extract<Perfil, (typeof PERFIS_ACAO)[number]>;

/**
 * Status e passos depois de um envio. Todos os passos marcados concluem a ação; desmarcar um passo
 * de ação concluída pelos passos a reabre; reabrir à mão limpa os passos, senão ela concluiria de novo.
 */
export function aplicarPassos(
  atual: { status: AcaoStatus; itens: readonly string[]; itensFeitos: readonly string[] },
  pedido: { status?: AcaoStatus; itensFeitos?: readonly string[] },
): { status: AcaoStatus; itensFeitos: string[] } {
  const completa = (feitos: readonly string[]) =>
    atual.itens.length > 0 && atual.itens.every((i) => feitos.includes(i));
  if (pedido.itensFeitos === undefined) {
    const reabriu = pedido.status === 'PENDENTE' && completa(atual.itensFeitos);
    return {
      status: pedido.status ?? atual.status,
      itensFeitos: reabriu ? [] : [...atual.itensFeitos],
    };
  }
  const itensFeitos = atual.itens.filter((i) => pedido.itensFeitos!.includes(i));
  if (completa(itensFeitos)) return { status: 'FEITA', itensFeitos };
  const desfez = atual.status === 'FEITA' && completa(atual.itensFeitos);
  return { status: pedido.status ?? (desfez ? 'PENDENTE' : atual.status), itensFeitos };
}
