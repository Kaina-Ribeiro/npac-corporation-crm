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
  pode: { inscricao: boolean; momento: boolean; anotacao: boolean; admin: boolean };
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
