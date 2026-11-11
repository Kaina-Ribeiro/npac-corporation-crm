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

/** `GET mentoria/eu`: o perfil operacional e o selo de Admin de quem está logado. */
export type EuMentoria = { perfil: Perfil | null; admin: boolean };

export type PerfilLinha = { id: string; nome: string; perfil: Perfil | null; admin: boolean };

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
  pode: {
    inscricao: boolean;
    momento: boolean;
    anotacao: boolean;
    onboarding: boolean;
    plano: boolean;
    admin: boolean;
  };
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
