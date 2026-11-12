import type {
  InscricaoStatus,
  Mentoria,
  Ocupacao,
  Origem,
  OrigemEndereco,
  Perfil,
  StatusFinanceiro,
  Tecnologia,
  TipoAvaliacao,
  TipoInscricao,
} from './enums.js';
import type { EnvioStatus, Etapa, EtapaStatus } from './onboarding.js';
import type { AcaoStatus, Gatilho, PerfilAcao, ReuniaoTipo } from './plano.js';
import type { CanalContato, Plataforma, ReuniaoStatus } from './reunioes.js';
import type { MetaStatus, Pilar } from './metas.js';
import type { CicloStatus, TarefaOrigem, TarefaStatus } from './pmes.js';

/** `GET mentoria/eu`: o perfil operacional e o selo de Admin de quem está logado. */
export type EuMentoria = { perfil: Perfil | null; admin: boolean };

export type PerfilLinha = { id: string; nome: string; perfil: Perfil | null; admin: boolean };

/**
 * Responsável pelo acompanhamento (`GET mentoria/responsaveis`). `elegivel`: pode ser escolhido
 * (perfil Acompanhamento, conta ativa). Os demais ainda respondem por alguma inscrição (saíram ou
 * perderam o perfil); `carteira` conta as inscrições em andamento.
 */
export type Responsavel = {
  id: string;
  nome: string;
  ativo: boolean;
  elegivel: boolean;
  carteira: number;
};

export type PessoaResumo = { nome: string; apelido: string | null; fotoMidiaId: string | null };

/** Linha da lista de Mentorados. `mesJornada` nulo = antes do início. */
export type InscricaoItem = {
  id: string;
  nome: string;
  tipo: TipoInscricao;
  mentoria: Mentoria;
  status: InscricaoStatus;
  mesJornada: number | null;
  responsavel: { id: string; nome: string } | null;
  /** Último contato ou reunião realizada (data de Brasília, `AAAA-MM-DD`). */
  ultimoContato: string | null;
  completar: boolean;
  pessoas: PessoaResumo[];
  /** Ações do plano: quantas há, feitas e atrasadas. */
  plano: { total: number; feitas: number; atrasadas: number };
};

/** Página da lista: 50 itens e cursor opaco (só o id do último, assinado). */
export type PaginaInscricoes = {
  itens: InscricaoItem[];
  cursor: string | null;
  total: number;
  /** Contagens da carteira inteira que a pessoa vê, sem os filtros. */
  resumo: ResumoCarteira;
};

export type ResumoCarteira = {
  total: number;
  ativos: number;
  onboarding: number;
  pausados: number;
  completar: number;
};

export type AvaliacaoDTO = {
  id: string;
  tipo: TipoAvaliacao;
  version: number;
  data: string | null;
  notaFe: number | null;
  notaSaude: number | null;
  notaDinheiro: number | null;
  notaRelacionamentos: number | null;
  resultadoProva: string | null;
};

export type PessoaDTO = {
  id: string;
  ordem: number;
  version: number;
  nome: string;
  apelido: string | null;
  fotoMidiaId: string | null;
  nascimento: string | null;
  cidade: string | null;
  uf: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  profissao: string | null;
  ocupacao: Ocupacao | null;
  filhosQuantidade: number | null;
  filhosIdades: string | null;
  tecnologia: Tecnologia | null;
  melhorHorario: string | null;
  canalPreferido: string | null;
  pulseira: string | null;
  avaliacoes: AvaliacaoDTO[];
};

export type EnderecoDTO = {
  version: number;
  endereco: string | null;
  cep: string | null;
  origem: OrigemEndereco;
};

export type MomentoDTO = {
  version: number;
  data: string | null;
  recebeCentavos: number | null;
  custoCentavos: number | null;
  temDividas: boolean | null;
  dividasCentavos: number | null;
  guardadoCentavos: number | null;
  dor: string | null;
  sonho: string | null;
  meta: string | null;
  travadoEm: string | null;
  travadoPor: string | null;
};

export type EtapaDTO = {
  id: string;
  etapa: Etapa;
  status: EtapaStatus;
  version: number;
  enviadaEm: string | null;
  concluidaEm: string | null;
  grupoCriadoEm: string | null;
  formularioPreenchido: boolean | null;
  grupoAvisos: boolean | null;
  grupoClube: boolean | null;
  grupoNacao: boolean | null;
  aulasConcluidas: boolean | null;
  aulasConcluidasEm: string | null;
};

export type CaixaDTO = {
  version: number;
  status: EnvioStatus;
  enviadoEm: string | null;
  rastreio: string | null;
  entregueEm: string | null;
};

/** Pessoa parada numa etapa do funil. `etapaId` e `version` servem para andar sem abrir a ficha. */
export type PessoaFunil = {
  inscricaoId: string;
  nome: string;
  tipo: TipoInscricao;
  mentoria: Mentoria;
  pessoas: PessoaResumo[];
  etapaId: string;
  version: number;
  etapa: Etapa;
  status: EtapaStatus;
  /** Dias de calendário de Brasília nesta situação. */
  dias: number;
  alerta: boolean;
};

export type CaixaPainel = {
  inscricaoId: string;
  nome: string;
  pessoas: PessoaResumo[];
  enviadoEm: string;
  rastreio: string | null;
  dias: number;
  alerta: boolean;
};

export type IdrPainel = {
  inscricaoId: string;
  nome: string;
  pessoas: PessoaResumo[];
  /** Nulo quando a Caixa foi dispensada. */
  entregueEm: string | null;
};

/** `POST mentoria/onboarding/painel`: a aba Onboarding inteira. */
export type PainelOnboarding = {
  total: number;
  funil: { etapa: Etapa; total: number; alertas: number; pessoas: PessoaFunil[] }[];
  caixasEmTransito: CaixaPainel[];
  idrsAAgendar: IdrPainel[];
};

/** Linha da prévia da importação: sem contato nem diagnóstico, que ficam no servidor. */
export type ItemPrevia = {
  chave: string;
  nome: string;
  tipo: TipoInscricao;
  mentoria: Mentoria | null;
  rotulo: string;
  status: 'ATIVO' | 'CANCELADO' | 'CONCLUIDO';
  pessoa1: string;
  pessoa2: string | null;
  completar: number;
};

/** `POST mentoria/carteira/importar/previa`. */
export type PreviaImportacao = {
  totais: {
    novos: number;
    individuais: number;
    casais: number;
    cancelados: number;
    completar: number;
    ignorados: number;
  };
  novos: ItemPrevia[];
  naoCasados: string[];
  parecidos: [string, string][];
  rotulosSemMentoria: { rotulo: string; total: number }[];
  ignorados: string[];
};

export type ResultadoImportacao = { importados: number; ignorados: number };

/** Linha do plano: sem observação, que só a página da ação decifra. */
export type AcaoItem = {
  id: string;
  version: number;
  inscricaoId: string;
  nome: string;
  pessoas: PessoaResumo[];
  mentoria: Mentoria;
  mes: number;
  foco: string;
  acao: string;
  reuniaoTipo: ReuniaoTipo | null;
  gatilho: Gatilho;
  itens: string[];
  itensFeitos: string[];
  dataPrevista: string;
  dataLimite: string;
  responsavelPerfil: PerfilAcao;
  responsavel: string | null;
  status: AcaoStatus;
  atrasada: boolean;
  anteriorAoSistema: boolean;
  feitaEm: string | null;
  feitaPor: string | null;
  podeEditar: boolean;
};

/** `GET mentoria/acoes/:id`: a página da ação. */
export type AcaoDTO = AcaoItem & {
  evidenciaLink: string | null;
  evidenciaMidiaId: string | null;
  observacao: string | null;
};

export type PaginaAcoes = { itens: AcaoItem[]; cursor: string | null; total: number };

/** `POST mentoria/plano/semana`: de segunda a domingo, em Brasília. */
export type PlanoSemana = {
  hoje: string;
  inicio: string;
  fim: string;
  atrasadas: AcaoItem[];
  atrasadasTotal: number;
  semana: AcaoItem[];
};

export type PlanoModeloLinha = {
  id: string;
  version: number;
  mentoria: Mentoria;
  mes: number;
  reuniaoTipo: ReuniaoTipo | null;
  foco: string;
  acao: string;
  itens: string[];
  responsavelPerfil: PerfilAcao;
  gatilho: Gatilho;
  diasParaExecutar: number;
  segueCalendario: boolean;
  ativo: boolean;
};

/** Ficha aberta: textos decifrados e o que a pessoa logada pode editar. */
export type FichaDTO = {
  id: string;
  version: number;
  nome: string;
  tipo: TipoInscricao;
  mentoria: Mentoria;
  mentoriaVariante: string | null;
  dataCompra: string | null;
  dataCompraAproximada: boolean;
  dataIdr: string | null;
  inicioJornada: string | null;
  terminoPrevisto: string | null;
  mesJornada: number | null;
  valorCentavos: number | null;
  formaPagamento: string | null;
  statusFinanceiro: StatusFinanceiro | null;
  status: InscricaoStatus;
  responsavelId: string | null;
  origem: Origem | null;
  linkPasta: string | null;
  linkGrupo: string | null;
  fotoFamiliaMidiaId: string | null;
  importada: boolean;
  pessoas: PessoaDTO[];
  endereco: EnderecoDTO | null;
  momento: MomentoDTO | null;
  onboarding: EtapaDTO[];
  caixa: CaixaDTO | null;
  /** Campos que vieram ilegíveis da importação e a equipe precisa completar. */
  completarCampos: string[];
  /** Ações do plano, em ordem de mês e data. */
  acoes: AcaoItem[];
  /** Reuniões (as que a pessoa logada vê) e contatos, mais recentes primeiro. */
  reunioes: ReuniaoItem[];
  contatos: ContatoDTO[];
  /** A pausa em curso, se houver. `dias`: parados até hoje. */
  pausa: { inicio: string; dias: number; motivo: string | null } | null;
  /** Ciclos de PME, do mais recente ao mais antigo (Fase 2). `hoje`: o dia de Brasília do cálculo. */
  ciclos: CicloDTO[];
  hoje: string;
  /** Metas (Parte 2): vazias para quem não as vê (Especialista). Mais recentes primeiro. */
  metas: MetaDTO[];
  /** Tarefas combinadas nas reuniões (as que a pessoa logada vê), mais recentes primeiro. */
  tarefasReuniao: TarefaDTO[];
  pode: {
    inscricao: boolean;
    momento: boolean;
    anotacao: boolean;
    onboarding: boolean;
    plano: boolean;
    reuniao: boolean;
    contato: boolean;
    /** Envio do PME, ciclo anterior ao sistema e data de envio (Admin, Acompanhamento, Operação). */
    pme: boolean;
    /** Marcar as tarefas do ciclo e fechar à mão (Admin, Acompanhamento). */
    tarefa: boolean;
    /** Criar e editar metas (Admin, Acompanhamento). */
    meta: boolean;
    admin: boolean;
  };
};

/** Catálogo de PMEs (Configurações > PMEs). */
export type PmeDTO = {
  id: string;
  version: number;
  numero: number;
  titulo: string | null;
  foco: string | null;
  linkMaterial: string | null;
  atividadesExtras: string[];
  encerramento: string | null;
  ativo: boolean;
};

export type TarefaDTO = {
  id: string;
  version: number;
  inscricaoId: string;
  origem: TarefaOrigem;
  cicloId: string | null;
  reuniaoId: string | null;
  /** Nula só depois da anonimização (LGPD). */
  descricao: string | null;
  prazo: string | null;
  status: TarefaStatus;
  motivo: string | null;
  comprovanteMidiaId: string | null;
  comprovanteTipo: MidiaDTO['tipo'] | null;
  cobradaEm: string | null;
  cobradaPor: string | null;
  /** Meta a que a tarefa da reunião serve (Parte 2). */
  metaId: string | null;
  /** Número do PME do ciclo, se a tarefa está num ciclo. */
  cicloNumero: number | null;
  /** Reunião onde foi combinada (ISO em UTC) e o tipo dela. */
  reuniaoInicio: string | null;
  reuniaoTipo: ReuniaoTipo | null;
  podeEditar: boolean;
};

/** Meta (Parte 2, S3). `pessoaId` nulo = do casal ou do individual. */
export type MetaDTO = {
  id: string;
  version: number;
  inscricaoId: string;
  cicloId: string | null;
  cicloNumero: number | null;
  reuniaoId: string | null;
  pessoaId: string | null;
  pilar: Pilar | null;
  /** Nula só depois da anonimização (LGPD). */
  descricao: string | null;
  valorAlvo: number | null;
  valorAtual: number | null;
  unidade: string | null;
  prazo: string | null;
  status: MetaStatus;
  criadoEm: string;
  podeEditar: boolean;
};

export type CicloDTO = {
  id: string;
  version: number;
  numero: number;
  titulo: string | null;
  linkMaterial: string | null;
  enviadoEm: string;
  prazo: string;
  concluidoEm: string | null;
  naoConcluidoEm: string | null;
  anteriorAoSistema: boolean;
  status: CicloStatus;
  /** Dias depois do prazo, só enquanto aberto (0 antes do prazo). */
  diasAtraso: number;
  /** % do PME (E5), do banco: tarefas FEITA ÷ total e progresso das metas. Nulo sem tarefas/metas. */
  pctTarefas: number | null;
  pctMetas: number | null;
  tarefas: TarefaDTO[];
};

export type HistoricoItem = {
  id: string;
  tipo: string;
  quando: string;
  ator: string;
  campos: string[];
  texto: string | null;
};

export type MidiaDTO = {
  id: string;
  donoTipo: string;
  donoId: string;
  tipo: 'FOTO' | 'VIDEO' | 'PDF' | 'LINK_VIDEO';
  urlVideo: string | null;
  mime: string | null;
  tamanhoBytes: number | null;
};

/** Linha da agenda e do histórico: sem os textos do registro, que só a página da reunião decifra. */
export type ReuniaoItem = {
  id: string;
  version: number;
  inscricaoId: string;
  nome: string;
  pessoas: PessoaResumo[];
  mentoria: Mentoria;
  tipo: ReuniaoTipo;
  conduzidaPor: { id: string; nome: string } | null;
  /** Mentorado experiente que conduz (sem login). */
  condutorInscricao: { id: string; nome: string } | null;
  /** ISO em UTC; a tela mostra em Brasília. */
  inicio: string;
  duracaoMin: number;
  plataforma: Plataforma | null;
  link: string | null;
  status: ReuniaoStatus;
  remarcadaParaId: string | null;
  /** Já passou do horário: pode virar REALIZADA ou FALTOU. */
  jaComecou: boolean;
  temRegistro: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
};

/** `GET mentoria/reunioes/:id`: a página da reunião, com o registro decifrado. */
export type ReuniaoDTO = ReuniaoItem & {
  resumo: string | null;
  metas: string | null;
  combinado: string | null;
  cobrar: string | null;
  trava: string | null;
  anotacaoInterna: string | null;
  humor: number | null;
  interesseRenovar: boolean | null;
  /** Tarefas da semana combinadas nesta reunião (até 3). */
  tarefas: TarefaDTO[];
  /** Cobrança: a reunião anterior mais recente com tarefas visíveis a quem abre. */
  cobranca: {
    reuniao: { id: string; inicio: string; tipo: ReuniaoTipo };
    tarefas: TarefaDTO[];
  } | null;
  /** Metas da inscrição (vazias para a Especialista). `metas` é o texto livre da Fase 1. */
  metasInscricao: MetaDTO[];
  /** Pessoas da inscrição, para a meta de uma pessoa do casal. */
  pessoasDaInscricao: { id: string; nome: string }[];
  /** Combinar tarefas nesta reunião (quem marca tarefas) e definir metas (Admin, Acompanhamento). */
  podeTarefa: boolean;
  podeMeta: boolean;
};

/** `POST mentoria/reunioes/agenda`: de segunda a domingo, em Brasília. */
export type AgendaSemana = {
  hoje: string;
  inicio: string;
  fim: string;
  reunioes: ReuniaoItem[];
};

export type LinhaControle = {
  inscricaoId: string;
  nome: string;
  pessoas: PessoaResumo[];
  mentoria: Mentoria;
  /** Reuniões realizadas no mês. */
  realizadas: number;
  /** Próxima reunião em aberto no mês, se houver. */
  agendada: string | null;
  /** Última reunião realizada, em qualquer mês (data de Brasília). */
  ultimaRealizada: string | null;
};

/** `POST mentoria/reunioes/controle-mensal`: quem teve reunião realizada no mês e quem falta. */
export type ControleMensal = {
  mes: string;
  fizeram: LinhaControle[];
  faltam: LinhaControle[];
  comparecimento: { realizadas: number; faltas: number; taxa: number | null };
};

/** De onde conta o "sem reunião": a última realizada, a IDR, o início ou a importação. */
export type BaseSemReuniao = 'REUNIAO' | 'IDR' | 'INICIO' | 'IMPORTACAO' | 'CADASTRO';

export type LinhaSemReuniao = {
  inscricaoId: string;
  nome: string;
  pessoas: PessoaResumo[];
  mentoria: Mentoria;
  responsavel: string | null;
  desde: string;
  base: BaseSemReuniao;
  dias: number;
};

export type SemReuniao = { itens: LinhaSemReuniao[] };

export type ContatoDTO = {
  id: string;
  quando: string;
  canal: CanalContato;
  motivo: string | null;
  respondeu: boolean | null;
  tempoRespostaMin: number | null;
  observacao: string | null;
  feitoPor: string;
};

/** Quem pode conduzir: qualquer usuário ativo (D4, §3), com o perfil do módulo se tiver. */
export type Condutor = { id: string; nome: string; perfil: Perfil | null };
