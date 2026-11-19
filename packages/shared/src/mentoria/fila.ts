/** Fila do dia (SPEC §5, D18). O banco calcula os itens (`mentoria_fila`); aqui, quem vê o quê. */
import type { Perfil, TipoInscricao, Mentoria } from './enums.js';
import type { Etapa, EtapaStatus } from './onboarding.js';
import type { ReuniaoTipo } from './plano.js';
import type { CanalContato, ReuniaoStatus } from './reunioes.js';
import type { TarefaOrigem, TarefaStatus } from './pmes.js';
import type { SemaforoCor, SemaforoMotivo } from './semaforo.js';

export const FILA_TIPOS = [
  'BOAS_VINDAS',
  'PASSO_DEVIDO',
  'PARADO',
  'ENVIAR_CAIXA',
  'CAIXA_ATRASADA',
  'AGENDAR_IDR',
  'LEMBRETE_IDR',
  'LINK_IDR',
  'ENVIAR_PME1',
  'ACAO',
  'FOTO_FAMILIA',
  'AGENDA_MES',
  'REUNIOES_6M',
  'REUNIAO_HOJE',
  'COBRANCA',
  'SEMAFORO',
  'ENVIAR_PME',
  'PME_ATRASADO',
] as const;
export type FilaTipo = (typeof FILA_TIPOS)[number];

/** Rótulo do tipo no filtro da Fila. */
export const FILA_TIPO_LABEL: Record<FilaTipo, string> = {
  BOAS_VINDAS: 'Boas-vindas',
  PASSO_DEVIDO: 'Próximo passo',
  PARADO: 'Parado',
  ENVIAR_CAIXA: 'Enviar a Caixa',
  CAIXA_ATRASADA: 'Caixa não recebida',
  AGENDAR_IDR: 'Agendar a IDR',
  LEMBRETE_IDR: 'Lembrete da IDR',
  LINK_IDR: 'Link da IDR',
  ENVIAR_PME1: '1º PME',
  ACAO: 'Ação do plano',
  FOTO_FAMILIA: 'Foto da família',
  AGENDA_MES: 'Arte da agenda',
  REUNIOES_6M: 'Reuniões 6M',
  REUNIAO_HOJE: 'Reunião de hoje',
  COBRANCA: 'Cobrança',
  SEMAFORO: 'Semáforo',
  ENVIAR_PME: 'Próximo PME',
  PME_ATRASADO: 'PME atrasado',
};

/** Degraus da escada de atraso do PME (PDF, página 19; E20), contados do prazo atual. */
export const DEGRAUS_ATRASO = [3, 7, 10, 15] as const;
export type DegrauAtraso = (typeof DEGRAUS_ATRASO)[number];
/** O que fazer em cada degrau, no texto do PDF. */
export const DEGRAU_LABEL: Record<DegrauAtraso, string> = {
  3: 'Mensagem leve no grupo',
  7: 'Áudio ou vídeo da Duda',
  10: 'Avaliar segunda chance',
  15: 'Ligação e reunião de destravamento',
};
/** O detalhe do PDF, para o painel. */
export const DEGRAU_DETALHE: Record<DegrauAtraso, string> = {
  3: 'Pergunte onde travou e ofereça ajuda com uma única tarefa.',
  7: 'Mande um áudio ou vídeo personalizado com a tarefa mais simples do PME para retomar.',
  10: 'Avalie a segunda chance de 7 dias, com só as tarefas essenciais para fechar o ciclo.',
  15: 'Ligue e marque a reunião de destravamento de 20 minutos, com no máximo 3 tarefas.',
};
/** Canal sugerido para o contato do degrau: o PDF fala em grupo e áudio (WhatsApp) e em ligação. */
export const DEGRAU_CANAL: Record<DegrauAtraso, CanalContato> = {
  3: 'WHATSAPP',
  7: 'WHATSAPP',
  10: 'WHATSAPP',
  15: 'LIGACAO',
};

/** Filtro por tipo na tela (D18), em grupos como no protótipo. */
export const FILA_GRUPOS = [
  { chave: 'REUNIOES', label: 'Reuniões', tipos: ['REUNIAO_HOJE', 'LINK_IDR', 'LEMBRETE_IDR'] },
  {
    chave: 'ONBOARDING',
    label: 'Onboarding',
    tipos: [
      'BOAS_VINDAS',
      'PASSO_DEVIDO',
      'PARADO',
      'ENVIAR_CAIXA',
      'CAIXA_ATRASADA',
      'AGENDAR_IDR',
      'ENVIAR_PME1',
    ],
  },
  { chave: 'PLANO', label: 'Plano', tipos: ['ACAO', 'FOTO_FAMILIA'] },
  {
    chave: 'COBRANCA',
    label: 'Cobrança e PMEs',
    tipos: ['COBRANCA', 'SEMAFORO', 'PME_ATRASADO', 'ENVIAR_PME'],
  },
  { chave: 'MES', label: 'Do mês', tipos: ['AGENDA_MES', 'REUNIOES_6M'] },
] as const satisfies readonly { chave: string; label: string; tipos: readonly FilaTipo[] }[];
export type FilaGrupo = (typeof FILA_GRUPOS)[number]['chave'];

/** Itens sem estado próprio: saem quando alguém marca feito (`mentoria_fila_feitos`). */
export const FILA_FEITO_MANUAL: readonly FilaTipo[] = [
  'LEMBRETE_IDR',
  'AGENDA_MES',
  'REUNIOES_6M',
  'SEMAFORO',
];

/** Itens da Operação que também vão para quem conduz a reunião. */
const COMPARTILHADOS: readonly FilaTipo[] = ['REUNIAO_HOJE', 'LINK_IDR'];

export type FilaEscopo = 'MINHA' | 'EQUIPE';

/** O item como sai do banco, sem dado pessoal. */
export type FilaItemBase = {
  chave: string;
  tipo: FilaTipo;
  inscricaoId: string | null;
  referenciaId: string | null;
  responsavelPerfil: Exclude<Perfil, 'MENTOR'>;
  /** A pessoa; nula = qualquer um do perfil (inclusive responsável desativado ou sem perfil). */
  responsavelId: string | null;
  venceEm: string;
  atrasado: boolean;
};

export type FilaEu = { id: string; perfil: Perfil | null; admin: boolean };

/** É da minha fila: meu nome no item, ou o meu perfil sem pessoa definida. */
export function itemEhMeu(item: FilaItemBase, eu: FilaEu): boolean {
  if (item.responsavelId === eu.id) return true;
  if (!eu.perfil || item.responsavelPerfil !== eu.perfil) return false;
  return item.responsavelId === null || COMPARTILHADOS.includes(item.tipo);
}

/**
 * "Minha fila": só o que é meu. "Equipe": Admin vê tudo, uma vez cada item; os demais, o que é
 * do perfil deles. A Especialista só recebe da RLS as inscrições e reuniões dela.
 */
export function itemVisivel(item: FilaItemBase, eu: FilaEu, escopo: FilaEscopo): boolean {
  if (escopo === 'MINHA') return itemEhMeu(item, eu);
  if (eu.admin) return true;
  return itemEhMeu(item, eu) || (!!eu.perfil && item.responsavelPerfil === eu.perfil);
}

/** Escopo padrão: Diretoria sem perfil não tem "minha fila", abre na equipe. */
export const escopoPadrao = (eu: FilaEu): FilaEscopo => (eu.perfil ? 'MINHA' : 'EQUIPE');

export type FilaPessoa = { nome: string; apelido: string | null; whatsapp: string | null };

/** O item pronto para a tela: o mentorado, a reunião ou a ação a que se refere. */
export type FilaItemDTO = FilaItemBase & {
  /** Nome de quem responde pelo item; nulo = o perfil. */
  responsavelNome: string | null;
  mentorado: {
    nome: string;
    tipo: TipoInscricao;
    mentoria: Mentoria;
    linkGrupo: string | null;
    pessoas: FilaPessoa[];
  } | null;
  etapa: { nome: Etapa; status: EtapaStatus; version: number } | null;
  reuniao: {
    tipo: ReuniaoTipo;
    inicio: string;
    status: ReuniaoStatus;
    version: number;
    link: string | null;
    condutor: string | null;
  } | null;
  acao: { mes: number; foco: string; acao: string; version: number } | null;
  /** COBRANCA: a tarefa, com o status atual (E17). */
  tarefa: {
    descricao: string | null;
    status: TarefaStatus;
    origem: TarefaOrigem;
    prazo: string;
    cicloNumero: number | null;
    version: number;
  } | null;
  /** SEMAFORO: a cor e os motivos de hoje (E18). */
  semaforo: { cor: SemaforoCor; motivos: SemaforoMotivo[] } | null;
  /** ENVIAR_PME e PME_ATRASADO: o ciclo (E19, E20). */
  ciclo: {
    numero: number;
    /** Prazo atual: a segunda chance ou o prazo (E16). */
    prazoAtual: string;
    diasAtraso: number;
    /** PME_ATRASADO: o degrau da escada. */
    degrau: DegrauAtraso | null;
  } | null;
};

export type FilaDTO = {
  agora: string;
  escopo: FilaEscopo;
  itens: FilaItemDTO[];
};

/** O que fazer, em uma linha, para a lista e o painel do item. */
export function filaTitulo(
  item: Pick<FilaItemDTO, 'tipo' | 'acao'> & Partial<Pick<FilaItemDTO, 'semaforo' | 'ciclo'>>,
): string {
  switch (item.tipo) {
    case 'BOAS_VINDAS':
      return 'Criar o grupo e enviar as boas-vindas';
    case 'PASSO_DEVIDO':
      return 'Equipe devendo o próximo passo';
    case 'PARADO':
      return 'Passo parado sem resposta';
    case 'ENVIAR_CAIXA':
      return 'Enviar a Caixa';
    case 'CAIXA_ATRASADA':
      return 'Caixa não recebida';
    case 'AGENDAR_IDR':
      return 'Agendar a IDR';
    case 'LEMBRETE_IDR':
      return 'Lembrete da IDR ao mentorado';
    case 'LINK_IDR':
      return 'Enviar o link da IDR';
    case 'ENVIAR_PME1':
      return 'Enviar o 1º PME';
    case 'ACAO':
      return item.acao ? `Mês ${item.acao.mes}: ${item.acao.acao}` : 'Ação do plano';
    case 'FOTO_FAMILIA':
      return 'Pedir a foto da família';
    case 'AGENDA_MES':
      return 'Enviar a arte da agenda do mês';
    case 'REUNIOES_6M':
      return 'Agendar as reuniões mensais do 6M';
    case 'REUNIAO_HOJE':
      return 'Reunião de hoje';
    case 'COBRANCA':
      return 'Cobrar a tarefa combinada';
    case 'SEMAFORO':
      return item.semaforo?.cor === 'VERMELHO' ? 'Semáforo vermelho' : 'Semáforo amarelo';
    case 'ENVIAR_PME':
      return item.ciclo ? `Enviar o ${item.ciclo.numero + 1}º PME` : 'Enviar o próximo PME';
    case 'PME_ATRASADO':
      return item.ciclo?.degrau
        ? `${DEGRAU_LABEL[item.ciclo.degrau]} (${item.ciclo.numero}º PME)`
        : 'PME atrasado';
  }
}
