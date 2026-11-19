/**
 * Arquivo de casos da regra única (NPAC-54, Fase 2). Roda na função pura
 * (`test/areas.test.ts`) e na gêmea em SQL (`packages/db/test/areas-regra.test.ts`): as duas têm de
 * dar o mesmo veredito, com o mesmo motivo. Cada linha da tabela "Quem faz → sobre quem → o quê" da
 * spec tem casos aqui, e os anti-objetivos também.
 */
import type { ContaAreas, ErroRegra, PedidoRegra } from '../src/areas.js';

export type Caso = { nome: string; pedido: PedidoRegra; esperado: 'OK' | ErroRegra };

const conta = (...areas: ContaAreas['areas']): ContaAreas => ({ mestre: false, areas });

export const MESTRE: ContaAreas = { mestre: true, areas: [] };
export const HEAD_COM = conta({ area: 'COMERCIAL', cargo: 'HEAD', head: true });
export const SDR = conta({ area: 'COMERCIAL', cargo: 'SDR', head: false });
export const CLOSER = conta({ area: 'COMERCIAL', cargo: 'CLOSER', head: false });
export const ADMIN_AC = conta({ area: 'ACOMPANHAMENTO', cargo: 'ACOMPANHAMENTO', head: true });
export const OPERACAO = conta({ area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: false });
export const SEM_PERFIL = conta({ area: 'ACOMPANHAMENTO', cargo: null, head: false });
/** Closer que também é Especialista (só a Diretoria cria). */
export const DUPLA = conta(
  { area: 'COMERCIAL', cargo: 'CLOSER', head: false },
  { area: 'ACOMPANHAMENTO', cargo: 'ESPECIALISTA', head: false },
);
/** Head do Comercial que também é Operação no Acompanhamento. */
export const DUPLA_HEAD = conta(
  { area: 'COMERCIAL', cargo: 'HEAD', head: true },
  { area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: false },
);
/** Head das duas áreas sem ser Diretoria (só a Diretoria cria). */
export const HEAD_AMBAS = conta(
  { area: 'COMERCIAL', cargo: 'HEAD', head: true },
  { area: 'ACOMPANHAMENTO', cargo: 'ACOMPANHAMENTO', head: true },
);

export const CASOS: Caso[] = [
  // ---------------------------------------------------------------- Ver contas
  {
    nome: 'Mestre vê a Diretoria',
    pedido: { ator: MESTRE, alvo: MESTRE, acao: 'VER' },
    esperado: 'OK',
  },
  {
    nome: 'Mestre vê o Acompanhamento',
    pedido: { ator: MESTRE, alvo: OPERACAO, acao: 'VER' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial vê SDR',
    pedido: { ator: HEAD_COM, alvo: SDR, acao: 'VER' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial vê outro Head',
    pedido: { ator: HEAD_COM, alvo: HEAD_COM, acao: 'VER' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial não vê o Acompanhamento',
    pedido: { ator: HEAD_COM, alvo: OPERACAO, acao: 'VER' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Head do Comercial não vê a Diretoria',
    pedido: { ator: HEAD_COM, alvo: MESTRE, acao: 'VER' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Head do Comercial vê quem tem as duas áreas',
    pedido: { ator: HEAD_COM, alvo: DUPLA, acao: 'VER' },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo vê conta sem perfil',
    pedido: { ator: ADMIN_AC, alvo: SEM_PERFIL, acao: 'VER' },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo não vê SDR',
    pedido: { ator: ADMIN_AC, alvo: SDR, acao: 'VER' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Admin do módulo vê quem tem as duas áreas',
    pedido: { ator: ADMIN_AC, alvo: DUPLA, acao: 'VER' },
    esperado: 'OK',
  },
  {
    nome: 'SDR não administra',
    pedido: { ator: SDR, alvo: CLOSER, acao: 'VER' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Operação não administra',
    pedido: { ator: OPERACAO, alvo: SEM_PERFIL, acao: 'VER' },
    esperado: 'PROIBIDO',
  },

  // ---------------------------------------------------------------- Convidar
  {
    nome: 'Mestre convida Diretoria',
    pedido: { ator: MESTRE, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'DIRETOR', mestre: true },
    esperado: 'OK',
  },
  {
    nome: 'Mestre convida Head',
    pedido: { ator: MESTRE, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'HEAD' },
    esperado: 'OK',
  },
  {
    nome: 'Mestre convida Admin do Acompanhamento',
    pedido: {
      ator: MESTRE,
      acao: 'CONVIDAR',
      area: 'ACOMPANHAMENTO',
      cargo: 'ACOMPANHAMENTO',
      head: true,
    },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial convida SDR',
    pedido: { ator: HEAD_COM, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'SDR' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial não convida Head',
    pedido: { ator: HEAD_COM, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'HEAD' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não convida Diretoria',
    pedido: { ator: HEAD_COM, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'DIRETOR', mestre: true },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não convida Operação',
    pedido: { ator: HEAD_COM, acao: 'CONVIDAR', area: 'ACOMPANHAMENTO', cargo: 'OPERACAO' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo convida Operação',
    pedido: { ator: ADMIN_AC, acao: 'CONVIDAR', area: 'ACOMPANHAMENTO', cargo: 'OPERACAO' },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo não convida outro Admin',
    pedido: {
      ator: ADMIN_AC,
      acao: 'CONVIDAR',
      area: 'ACOMPANHAMENTO',
      cargo: 'ACOMPANHAMENTO',
      head: true,
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não convida SDR',
    pedido: { ator: ADMIN_AC, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'SDR' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não convida Head do Comercial',
    pedido: { ator: ADMIN_AC, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'HEAD' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'SDR não convida',
    pedido: { ator: SDR, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'SDR' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Operação não convida',
    pedido: { ator: OPERACAO, acao: 'CONVIDAR', area: 'ACOMPANHAMENTO', cargo: 'MENTOR' },
    esperado: 'PROIBIDO',
  },

  // ---------------------------------------------------------------- Pedidos de acesso
  {
    nome: 'Mestre vê pedido do Acompanhamento',
    pedido: { ator: MESTRE, acao: 'VER_PEDIDO', pedidoArea: 'ACOMPANHAMENTO' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial vê pedido do Comercial',
    pedido: { ator: HEAD_COM, acao: 'VER_PEDIDO', pedidoArea: 'COMERCIAL' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial não vê pedido do Acompanhamento',
    pedido: { ator: HEAD_COM, acao: 'VER_PEDIDO', pedidoArea: 'ACOMPANHAMENTO' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Admin do módulo vê pedido do Acompanhamento',
    pedido: { ator: ADMIN_AC, acao: 'VER_PEDIDO', pedidoArea: 'ACOMPANHAMENTO' },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo não vê pedido do Comercial',
    pedido: { ator: ADMIN_AC, acao: 'VER_PEDIDO', pedidoArea: 'COMERCIAL' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'SDR não vê pedidos',
    pedido: { ator: SDR, acao: 'VER_PEDIDO', pedidoArea: 'COMERCIAL' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Mestre aprova pedido do Comercial em outra área',
    pedido: {
      ator: MESTRE,
      acao: 'APROVAR',
      pedidoArea: 'COMERCIAL',
      area: 'ACOMPANHAMENTO',
      cargo: 'MENTOR',
    },
    esperado: 'OK',
  },
  {
    nome: 'Mestre aprova como Head',
    pedido: {
      ator: MESTRE,
      acao: 'APROVAR',
      pedidoArea: 'COMERCIAL',
      area: 'COMERCIAL',
      cargo: 'HEAD',
    },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial aprova Closer',
    pedido: {
      ator: HEAD_COM,
      acao: 'APROVAR',
      pedidoArea: 'COMERCIAL',
      area: 'COMERCIAL',
      cargo: 'CLOSER',
    },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial não aprova Head',
    pedido: {
      ator: HEAD_COM,
      acao: 'APROVAR',
      pedidoArea: 'COMERCIAL',
      area: 'COMERCIAL',
      cargo: 'HEAD',
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não aprova com cargo do Acompanhamento',
    pedido: {
      ator: HEAD_COM,
      acao: 'APROVAR',
      pedidoArea: 'COMERCIAL',
      area: 'ACOMPANHAMENTO',
      cargo: 'MENTOR',
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não aprova pedido do Acompanhamento',
    pedido: {
      ator: HEAD_COM,
      acao: 'APROVAR',
      pedidoArea: 'ACOMPANHAMENTO',
      area: 'COMERCIAL',
      cargo: 'SDR',
    },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Admin do módulo aprova Especialista',
    pedido: {
      ator: ADMIN_AC,
      acao: 'APROVAR',
      pedidoArea: 'ACOMPANHAMENTO',
      area: 'ACOMPANHAMENTO',
      cargo: 'ESPECIALISTA',
    },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo não aprova com o selo',
    pedido: {
      ator: ADMIN_AC,
      acao: 'APROVAR',
      pedidoArea: 'ACOMPANHAMENTO',
      area: 'ACOMPANHAMENTO',
      cargo: 'ESPECIALISTA',
      head: true,
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não aprova como SDR',
    pedido: {
      ator: ADMIN_AC,
      acao: 'APROVAR',
      pedidoArea: 'ACOMPANHAMENTO',
      area: 'COMERCIAL',
      cargo: 'SDR',
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head das duas áreas aprova só com cargo da área do pedido',
    pedido: {
      ator: HEAD_AMBAS,
      acao: 'APROVAR',
      pedidoArea: 'COMERCIAL',
      area: 'ACOMPANHAMENTO',
      cargo: 'OPERACAO',
    },
    esperado: 'PROIBIDO',
  },

  // ---------------------------------------------------------------- Trocar cargo na área
  {
    nome: 'Mestre troca cargo de Head',
    pedido: { ator: MESTRE, alvo: HEAD_COM, acao: 'CARGO', area: 'COMERCIAL', cargo: 'SDR' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial troca SDR para Closer',
    pedido: { ator: HEAD_COM, alvo: SDR, acao: 'CARGO', area: 'COMERCIAL', cargo: 'CLOSER' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial troca o cargo comercial de quem tem as duas áreas',
    pedido: { ator: HEAD_COM, alvo: DUPLA, acao: 'CARGO', area: 'COMERCIAL', cargo: 'SDR' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial não mexe no cargo de outro Head',
    pedido: { ator: HEAD_COM, alvo: HEAD_COM, acao: 'CARGO', area: 'COMERCIAL', cargo: 'SDR' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não troca cargo no Acompanhamento',
    pedido: {
      ator: HEAD_COM,
      alvo: OPERACAO,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'MENTOR',
    },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Head do Comercial não troca o cargo do Acompanhamento de quem tem as duas',
    pedido: { ator: HEAD_COM, alvo: DUPLA, acao: 'CARGO', area: 'ACOMPANHAMENTO', cargo: 'MENTOR' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo troca o perfil de Operação',
    pedido: {
      ator: ADMIN_AC,
      alvo: OPERACAO,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'MENTOR',
    },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo dá perfil a quem não tem',
    pedido: {
      ator: ADMIN_AC,
      alvo: SEM_PERFIL,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'OPERACAO',
    },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo tira o perfil (falta perfil)',
    pedido: { ator: ADMIN_AC, alvo: OPERACAO, acao: 'CARGO', area: 'ACOMPANHAMENTO', cargo: null },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo troca o perfil de quem tem as duas áreas',
    pedido: { ator: ADMIN_AC, alvo: DUPLA, acao: 'CARGO', area: 'ACOMPANHAMENTO', cargo: 'MENTOR' },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo não mexe no perfil de outro Admin',
    pedido: {
      ator: ADMIN_AC,
      alvo: ADMIN_AC,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'OPERACAO',
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não troca cargo comercial',
    pedido: { ator: ADMIN_AC, alvo: SDR, acao: 'CARGO', area: 'COMERCIAL', cargo: 'CLOSER' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Admin do módulo não mexe em Head do Comercial que é Operação',
    pedido: {
      ator: ADMIN_AC,
      alvo: DUPLA_HEAD,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'MENTOR',
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'SDR não troca cargo',
    pedido: { ator: SDR, alvo: CLOSER, acao: 'CARGO', area: 'COMERCIAL', cargo: 'SDR' },
    esperado: 'PROIBIDO',
  },

  // ---------------------------------------------------------------- Dar ou tirar Head
  {
    nome: 'Mestre dá Head',
    pedido: { ator: MESTRE, alvo: SDR, acao: 'CARGO', area: 'COMERCIAL', cargo: 'HEAD' },
    esperado: 'OK',
  },
  {
    nome: 'Mestre dá o selo de Admin',
    pedido: {
      ator: MESTRE,
      alvo: OPERACAO,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'OPERACAO',
      head: true,
    },
    esperado: 'OK',
  },
  {
    nome: 'Mestre tira o selo de Admin',
    pedido: {
      ator: MESTRE,
      alvo: ADMIN_AC,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'ACOMPANHAMENTO',
      head: false,
    },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial não dá Head (anti-objetivo)',
    pedido: { ator: HEAD_COM, alvo: SDR, acao: 'CARGO', area: 'COMERCIAL', cargo: 'HEAD' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não tira Head',
    pedido: { ator: HEAD_COM, alvo: HEAD_COM, acao: 'CARGO', area: 'COMERCIAL', cargo: 'CLOSER' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não dá o selo (achado)',
    pedido: {
      ator: ADMIN_AC,
      alvo: OPERACAO,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'OPERACAO',
      head: true,
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não tira o selo de outro',
    pedido: {
      ator: ADMIN_AC,
      alvo: ADMIN_AC,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'ACOMPANHAMENTO',
      head: false,
    },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não faz um SDR virar Head do Comercial (anti-objetivo; nem o enxerga)',
    pedido: { ator: ADMIN_AC, alvo: SDR, acao: 'CARGO', area: 'COMERCIAL', cargo: 'HEAD' },
    esperado: 'INVISIVEL',
  },

  // ---------------------------------------------------------------- Senha, MFA, desativar, reativar
  {
    nome: 'Mestre redefine a senha de Head',
    pedido: { ator: MESTRE, alvo: HEAD_COM, acao: 'CONTA' },
    esperado: 'OK',
  },
  {
    nome: 'Mestre desativa quem tem as duas áreas',
    pedido: { ator: MESTRE, alvo: DUPLA, acao: 'DESATIVAR' },
    esperado: 'OK',
  },
  {
    nome: 'Mestre desativa outra Diretoria',
    pedido: { ator: MESTRE, alvo: MESTRE, acao: 'DESATIVAR' },
    esperado: 'OK',
  },
  {
    nome: 'Mestre redefine a própria senha',
    pedido: { ator: MESTRE, alvo: MESTRE, proprio: true, acao: 'CONTA' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial redefine a senha de SDR',
    pedido: { ator: HEAD_COM, alvo: SDR, acao: 'CONTA' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial desativa Closer',
    pedido: { ator: HEAD_COM, alvo: CLOSER, acao: 'DESATIVAR' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial não redefine a senha de outro Head (anti-objetivo)',
    pedido: { ator: HEAD_COM, alvo: HEAD_COM, acao: 'CONTA' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não desativa outro Head',
    pedido: { ator: HEAD_COM, alvo: HEAD_COM, acao: 'DESATIVAR' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não redefine a senha da Diretoria',
    pedido: { ator: HEAD_COM, alvo: MESTRE, acao: 'CONTA' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Head do Comercial não redefine a senha do Acompanhamento',
    pedido: { ator: HEAD_COM, alvo: OPERACAO, acao: 'CONTA' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Head do Comercial não redefine a senha de conta em duas áreas (anti-objetivo)',
    pedido: { ator: HEAD_COM, alvo: DUPLA, acao: 'CONTA' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não desativa conta em duas áreas',
    pedido: { ator: HEAD_COM, alvo: DUPLA, acao: 'DESATIVAR' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não redefine a própria senha pelo Admin',
    pedido: { ator: HEAD_COM, alvo: HEAD_COM, proprio: true, acao: 'CONTA' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo redefine a senha de Operação',
    pedido: { ator: ADMIN_AC, alvo: OPERACAO, acao: 'CONTA' },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo desativa conta sem perfil',
    pedido: { ator: ADMIN_AC, alvo: SEM_PERFIL, acao: 'DESATIVAR' },
    esperado: 'OK',
  },
  {
    nome: 'Admin do módulo não desativa outro Admin',
    pedido: { ator: ADMIN_AC, alvo: ADMIN_AC, acao: 'DESATIVAR' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não redefine a senha de conta em duas áreas',
    pedido: { ator: ADMIN_AC, alvo: DUPLA, acao: 'CONTA' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não redefine a senha de Head do Comercial que é Operação',
    pedido: { ator: ADMIN_AC, alvo: DUPLA_HEAD, acao: 'CONTA' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não zera o MFA de SDR',
    pedido: { ator: ADMIN_AC, alvo: SDR, acao: 'CONTA' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'SDR não redefine senha',
    pedido: { ator: SDR, alvo: CLOSER, acao: 'CONTA' },
    esperado: 'PROIBIDO',
  },

  // ---------------------------------------------------------------- Segunda área, trocar de área
  {
    nome: 'Mestre põe Closer no Acompanhamento',
    pedido: {
      ator: MESTRE,
      alvo: CLOSER,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'ESPECIALISTA',
    },
    esperado: 'OK',
  },
  {
    nome: 'Mestre tira uma área',
    pedido: { ator: MESTRE, alvo: DUPLA, acao: 'REMOVER_AREA', area: 'COMERCIAL' },
    esperado: 'OK',
  },
  {
    nome: 'Head do Comercial não põe SDR no Acompanhamento',
    pedido: { ator: HEAD_COM, alvo: SDR, acao: 'CARGO', area: 'ACOMPANHAMENTO', cargo: 'OPERACAO' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não tira ninguém de uma área',
    pedido: { ator: HEAD_COM, alvo: DUPLA, acao: 'REMOVER_AREA', area: 'ACOMPANHAMENTO' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Admin do módulo não traz conta do Comercial',
    pedido: { ator: ADMIN_AC, alvo: SDR, acao: 'CARGO', area: 'ACOMPANHAMENTO', cargo: 'OPERACAO' },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Admin do módulo não tira ninguém do Acompanhamento',
    pedido: { ator: ADMIN_AC, alvo: OPERACAO, acao: 'REMOVER_AREA', area: 'ACOMPANHAMENTO' },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head das duas áreas não põe alguém na outra (M4)',
    pedido: {
      ator: HEAD_AMBAS,
      alvo: SDR,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'OPERACAO',
    },
    esperado: 'PROIBIDO',
  },

  // ---------------------------------------------------------------- Diretoria
  {
    nome: 'Mestre dá Diretoria',
    pedido: { ator: MESTRE, alvo: HEAD_COM, acao: 'MESTRE', mestre: true },
    esperado: 'OK',
  },
  {
    nome: 'Mestre tira outra Diretoria',
    pedido: { ator: MESTRE, alvo: MESTRE, acao: 'MESTRE', mestre: false },
    esperado: 'OK',
  },
  {
    nome: 'Mestre não tira a própria Diretoria (nunca a última)',
    pedido: { ator: MESTRE, alvo: MESTRE, proprio: true, acao: 'MESTRE', mestre: false },
    esperado: 'PROPRIO',
  },
  {
    nome: 'Head do Comercial não dá Diretoria (anti-objetivo)',
    pedido: { ator: HEAD_COM, alvo: SDR, acao: 'MESTRE', mestre: true },
    esperado: 'PROIBIDO',
  },
  {
    nome: 'Head do Comercial não se faz Diretoria',
    pedido: { ator: HEAD_COM, alvo: HEAD_COM, proprio: true, acao: 'MESTRE', mestre: true },
    esperado: 'PROPRIO',
  },
  {
    nome: 'Head do Comercial não tira a Diretoria',
    pedido: { ator: HEAD_COM, alvo: MESTRE, acao: 'MESTRE', mestre: false },
    esperado: 'INVISIVEL',
  },
  {
    nome: 'Admin do módulo não dá Diretoria',
    pedido: { ator: ADMIN_AC, alvo: OPERACAO, acao: 'MESTRE', mestre: true },
    esperado: 'PROIBIDO',
  },

  // ---------------------------------------------------------------- Próprio cargo
  {
    nome: 'Mestre não mexe no próprio cargo',
    pedido: {
      ator: MESTRE,
      alvo: MESTRE,
      proprio: true,
      acao: 'CARGO',
      area: 'COMERCIAL',
      cargo: 'HEAD',
    },
    esperado: 'PROPRIO',
  },
  {
    nome: 'Mestre não se desativa',
    pedido: { ator: MESTRE, alvo: MESTRE, proprio: true, acao: 'DESATIVAR' },
    esperado: 'PROPRIO',
  },
  {
    nome: 'Head do Comercial não troca o próprio cargo',
    pedido: {
      ator: HEAD_COM,
      alvo: HEAD_COM,
      proprio: true,
      acao: 'CARGO',
      area: 'COMERCIAL',
      cargo: 'SDR',
    },
    esperado: 'PROPRIO',
  },
  {
    nome: 'Head do Comercial não se desativa',
    pedido: { ator: HEAD_COM, alvo: HEAD_COM, proprio: true, acao: 'DESATIVAR' },
    esperado: 'PROPRIO',
  },
  {
    nome: 'Admin do módulo não troca o próprio perfil',
    pedido: {
      ator: ADMIN_AC,
      alvo: ADMIN_AC,
      proprio: true,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'OPERACAO',
      head: true,
    },
    esperado: 'PROPRIO',
  },
  {
    nome: 'Admin do módulo não tira o próprio selo',
    pedido: {
      ator: ADMIN_AC,
      alvo: ADMIN_AC,
      proprio: true,
      acao: 'CARGO',
      area: 'ACOMPANHAMENTO',
      cargo: 'ACOMPANHAMENTO',
      head: false,
    },
    esperado: 'PROPRIO',
  },
  {
    nome: 'Admin do módulo não sai da área',
    pedido: {
      ator: ADMIN_AC,
      alvo: ADMIN_AC,
      proprio: true,
      acao: 'REMOVER_AREA',
      area: 'ACOMPANHAMENTO',
    },
    esperado: 'PROPRIO',
  },
  {
    nome: 'SDR não troca o próprio cargo',
    pedido: {
      ator: SDR,
      alvo: SDR,
      proprio: true,
      acao: 'CARGO',
      area: 'COMERCIAL',
      cargo: 'HEAD',
    },
    esperado: 'PROPRIO',
  },
];
