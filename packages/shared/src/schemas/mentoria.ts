import { z } from 'zod';
import { dataCalendarioValida } from '../mentoria/datas.js';
import {
  INSCRICAO_STATUS,
  MENTORIAS,
  OCUPACOES,
  ORIGENS,
  ORIGENS_ENDERECO,
  PERFIS,
  STATUS_FINANCEIRO,
  TECNOLOGIAS,
  TIPOS_AVALIACAO,
  TIPOS_INSCRICAO,
} from '../mentoria/enums.js';
import { STATUS_IMPORTACAO } from '../mentoria/importacao.js';
import { linkPermitido } from '../mentoria/links.js';
import { FILA_TIPOS } from '../mentoria/fila.js';
import { MOMENTOS_MENSAGEM } from '../mentoria/mensagens.js';
import { ENVIO_STATUS } from '../mentoria/onboarding.js';
import { ACAO_STATUS, GATILHOS, PERFIS_ACAO, REUNIAO_TIPOS } from '../mentoria/plano.js';
import { META_STATUS, PILARES } from '../mentoria/metas.js';
import { TAREFA_STATUS } from '../mentoria/pmes.js';
import {
  CANAIS_CONTATO,
  dataHoraValida,
  mesValido,
  PLATAFORMAS,
  REUNIAO_STATUS,
} from '../mentoria/reunioes.js';

/** Vazio vira nulo: limpar um campo na tela apaga o valor. */
const vazioNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const opc = <T extends z.ZodType>(s: T) => z.preprocess(vazioNulo, s.nullable()).optional();

const texto = (max: number) => opc(z.string().trim().max(max));
const dataIso = z.string().refine(dataCalendarioValida, 'Data inválida');
const data = opc(dataIso);
const centavos = opc(z.number().int().min(0).max(100_000_000_000));
const nota = opc(z.number().int().min(0).max(10));
const version = z.number().int().min(1);

const linkPasta = opc(z.string().trim().max(2000).refine(linkPermitido, 'Link não permitido'));
const linkGrupo = opc(
  z
    .string()
    .trim()
    .max(2000)
    .refine(
      (v) => v.startsWith('https://chat.whatsapp.com/'),
      'Use o link de convite do grupo (https://chat.whatsapp.com/...)',
    ),
);

const camposPessoa = {
  apelido: texto(80),
  nascimento: data,
  cidade: texto(120),
  uf: opc(z.string().trim().toUpperCase().length(2)),
  whatsapp: texto(40),
  email: opc(z.email().max(254)),
  instagram: texto(120),
  profissao: texto(120),
  ocupacao: opc(z.enum(OCUPACOES)),
  filhosQuantidade: opc(z.number().int().min(0).max(30)),
  filhosIdades: texto(120),
  tecnologia: opc(z.enum(TECNOLOGIAS)),
  melhorHorario: texto(120),
  canalPreferido: texto(40),
  pulseira: texto(40),
};
const nomePessoa = z.string().trim().min(1, 'Informe o nome').max(200);

export const pessoaNovaSchema = z.object({ nome: nomePessoa, ...camposPessoa }).strict();
export type PessoaNova = z.output<typeof pessoaNovaSchema>;

export const pessoaPatchSchema = z
  .object({ version, nome: nomePessoa.optional(), ...camposPessoa })
  .strict();
export type PessoaPatch = z.output<typeof pessoaPatchSchema>;

const camposInscricao = {
  mentoriaVariante: texto(80),
  dataCompra: data,
  dataCompraAproximada: z.boolean().optional(),
  inicioJornada: data,
  terminoPrevisto: data,
  valorCentavos: centavos,
  formaPagamento: texto(120),
  statusFinanceiro: opc(z.enum(STATUS_FINANCEIRO)),
  responsavelId: opc(z.string().min(1).max(100)),
  origem: opc(z.enum(ORIGENS)),
  linkPasta,
  linkGrupo,
};

export const inscricaoNovaSchema = z
  .object({
    tipo: z.enum(TIPOS_INSCRICAO),
    mentoria: z.enum(MENTORIAS),
    ...camposInscricao,
    pessoas: z.array(pessoaNovaSchema).min(1).max(2),
  })
  .strict();
export type InscricaoNova = z.output<typeof inscricaoNovaSchema>;

export const inscricaoPatchSchema = z
  .object({
    version,
    mentoria: z.enum(MENTORIAS).optional(),
    status: z.enum(INSCRICAO_STATUS).optional(),
    ...camposInscricao,
  })
  .strict();
export type InscricaoPatch = z.output<typeof inscricaoPatchSchema>;

export const inscricoesListaSchema = z
  .object({
    mes: z.number().int().min(1).max(1200).optional(),
    status: z.enum(INSCRICAO_STATUS).optional(),
    responsavelId: z.string().min(1).max(100).optional(),
    completar: z.boolean().optional(),
    cursor: z.string().max(400).optional(),
  })
  .strict();
export type InscricoesLista = z.output<typeof inscricoesListaSchema>;

export const buscaSchema = z.object({ termo: z.string().trim().min(1).max(200) }).strict();

/** Primeira gravação manda `version: 0`; as seguintes, a da resposta anterior. */
const versionPut = z.number().int().min(0);

export const enderecoSchema = z
  .object({
    version: versionPut,
    endereco: texto(1000),
    cep: opc(
      z
        .string()
        .trim()
        .transform((v) => v.replace(/\D/g, ''))
        .refine((v) => v.length === 8, 'CEP inválido'),
    ),
    origem: z.enum(ORIGENS_ENDERECO).optional(),
  })
  .strict();
export type EnderecoPut = z.output<typeof enderecoSchema>;

export const momentoSchema = z
  .object({
    version: versionPut,
    data,
    recebeCentavos: centavos,
    custoCentavos: centavos,
    temDividas: opc(z.boolean()),
    dividasCentavos: centavos,
    guardadoCentavos: centavos,
    dor: texto(20_000),
    sonho: texto(20_000),
    meta: texto(20_000),
  })
  .strict();
export type MomentoPut = z.output<typeof momentoSchema>;

export const avaliacaoSchema = z
  .object({
    tipo: z.enum(TIPOS_AVALIACAO),
    version: z.number().int().min(0).optional(),
    data,
    notaFe: nota,
    notaSaude: nota,
    notaDinheiro: nota,
    notaRelacionamentos: nota,
    resultadoProva: texto(200),
  })
  .strict();
export type AvaliacaoPut = z.output<typeof avaliacaoSchema>;

export const etapaPatchSchema = z
  .object({
    version,
    status: z.enum(['ENVIADA', 'CONCLUIDA']).optional(),
    grupoCriadoEm: data,
    formularioPreenchido: opc(z.boolean()),
    grupoAvisos: opc(z.boolean()),
    grupoClube: opc(z.boolean()),
    grupoNacao: opc(z.boolean()),
    aulasConcluidas: opc(z.boolean()),
    aulasConcluidasEm: data,
  })
  .strict();
export type EtapaPatch = z.output<typeof etapaPatchSchema>;

export const etapaDispensarSchema = z.object({ version }).strict();

export const caixaSchema = z
  .object({
    version: versionPut,
    status: z.enum(ENVIO_STATUS),
    enviadoEm: data,
    rastreio: texto(120),
    entregueEm: data,
  })
  .strict();
export type CaixaPut = z.output<typeof caixaSchema>;

const registrosImportados = z.array(z.unknown()).max(25_000).optional();

const decisoesSchema = z
  .object({
    rotulos: z.record(z.string().max(500), z.enum(MENTORIAS)).optional(),
    casais: z
      .record(
        z.string().max(500),
        z
          .object({
            pessoa1: nomePessoa,
            pessoa2: z.preprocess(vazioNulo, z.string().trim().max(200).nullable()),
          })
          .strict(),
      )
      .optional(),
    parecidos: z.record(z.string().max(1100), z.enum(['JUNTAR', 'SEPARAR'])).optional(),
    status: z.record(z.string().max(500), z.enum(STATUS_IMPORTACAO)).optional(),
  })
  .strict();

export const importarCarteiraSchema = z
  .object({
    gerenciador: z
      .object({
        dashboard: registrosImportados,
        linhaDoTempo: registrosImportados,
        rdv: registrosImportados,
      })
      .strict()
      .optional(),
    planilhaBase64: z.string().max(27_000_000).optional(),
    decisoes: decisoesSchema.optional(),
  })
  .strict()
  .refine(
    (b) =>
      !!b.planilhaBase64 ||
      !!b.gerenciador?.dashboard?.length ||
      !!b.gerenciador?.linhaDoTempo?.length ||
      !!b.gerenciador?.rdv?.length,
    'Envie ao menos um arquivo',
  );
export type ImportarCarteira = z.output<typeof importarCarteiraSchema>;

export const planoListaSchema = z
  .object({
    inscricaoId: z.uuid().optional(),
    mes: z.number().int().min(1).max(120).optional(),
    situacao: z.enum(['PENDENTE', 'FEITA', 'ATRASADA']).optional(),
    cursor: z.string().max(400).optional(),
  })
  .strict();
export type PlanoLista = z.output<typeof planoListaSchema>;

const passo = z.string().trim().min(1).max(120);

export const acaoPatchSchema = z
  .object({
    version,
    status: z.enum(ACAO_STATUS).optional(),
    itensFeitos: z.array(passo).max(20).optional(),
    evidenciaLink: opc(
      z
        .string()
        .trim()
        .max(2000)
        .refine((v) => v.startsWith('https://'), 'Use um link que comece com https://'),
    ),
    observacao: texto(20_000),
  })
  .strict();
export type AcaoPatch = z.output<typeof acaoPatchSchema>;

/** Sem `id` cria uma linha; com `id` e `version`, muda só os campos enviados. */
export const planoModeloPutSchema = z
  .object({
    id: z.uuid().optional(),
    version: z.number().int().min(1).optional(),
    mentoria: z.enum(MENTORIAS).optional(),
    mes: z.number().int().min(1).max(120).optional(),
    reuniaoTipo: opc(z.enum(REUNIAO_TIPOS)),
    foco: z.string().trim().min(1, 'Informe o foco').max(120).optional(),
    acao: z.string().trim().min(1, 'Informe a ação').max(500).optional(),
    itens: z.array(passo).max(20).optional(),
    responsavelPerfil: z.enum(PERFIS_ACAO).optional(),
    gatilho: z.enum(GATILHOS).optional(),
    diasParaExecutar: z.number().int().min(0).max(60).optional(),
    segueCalendario: z.boolean().optional(),
    ativo: z.boolean().optional(),
  })
  .strict();
export type PlanoModeloPut = z.output<typeof planoModeloPutSchema>;

// PMEs, ciclos e tarefas (Fase 2, Parte 1).
const atividade = z.string().trim().min(1).max(500);

/** Sem `id` cria o número do catálogo; com `id` e `version`, muda só os campos enviados. */
export const pmePutSchema = z
  .object({
    id: z.uuid().optional(),
    version: z.number().int().min(1).optional(),
    numero: z.number().int().min(0).max(12).optional(),
    titulo: texto(120),
    foco: texto(500),
    linkMaterial: linkPasta,
    atividadesExtras: z.array(atividade).max(20).optional(),
    encerramento: texto(500),
    ativo: z.boolean().optional(),
  })
  .strict();
export type PmePut = z.output<typeof pmePutSchema>;

/** Envio do próximo PME. Sem data: hoje. */
export const envioPmeSchema = z.object({ enviadoEm: dataIso.optional() }).strict();
export type EnvioPme = z.output<typeof envioPmeSchema>;

/** Ciclo de antes do sistema (carteira importada): número e datas escolhidos, sem tarefas. */
export const cicloAnteriorSchema = z
  .object({
    numero: z.number().int().min(1).max(12),
    enviadoEm: dataIso,
    concluidoEm: data,
  })
  .strict();
export type CicloAnterior = z.output<typeof cicloAnteriorSchema>;

/** Corrigir a data de envio; fechar ou reabrir à mão o ciclo sem tarefa de encerramento. */
export const cicloPatchSchema = z
  .object({ version, enviadoEm: dataIso.optional(), concluidoEm: data })
  .strict();
export type CicloPatch = z.output<typeof cicloPatchSchema>;

// Metas e tarefas da reunião (Parte 2). Texto e prazo só valem para a tarefa da reunião.
const descricaoTarefa = z.string().trim().min(1, 'Descreva a tarefa').max(2000);
const descricaoMeta = z.string().trim().min(1, 'Descreva a meta').max(2000);
const VALOR_MAX = 999_999_999_999;

export const tarefaPatchSchema = z
  .object({
    version,
    status: z.enum(TAREFA_STATUS).optional(),
    motivo: texto(2000),
    descricao: descricaoTarefa.optional(),
    prazo: dataIso.optional(),
    metaId: opc(z.uuid()),
  })
  .strict();
export type TarefaPatch = z.output<typeof tarefaPatchSchema>;

/** Tarefa da semana, combinada na reunião: prazo obrigatório (§4). */
export const tarefaCriarSchema = z
  .object({ descricao: descricaoTarefa, prazo: dataIso, metaId: opc(z.uuid()) })
  .strict();
export type TarefaCriar = z.output<typeof tarefaCriarSchema>;

const camposMeta = {
  pilar: opc(z.enum(PILARES)),
  pessoaId: opc(z.uuid()),
  valorAlvo: opc(z.number().positive('O alvo é maior que zero').max(VALOR_MAX)),
  valorAtual: opc(z.number().min(0).max(VALOR_MAX)),
  unidade: texto(20),
  prazo: data,
};

export const metaCriarSchema = z
  .object({ descricao: descricaoMeta, ...camposMeta, reuniaoId: opc(z.uuid()) })
  .strict();
export type MetaCriar = z.output<typeof metaCriarSchema>;

export const metaPatchSchema = z
  .object({
    version,
    descricao: descricaoMeta.optional(),
    ...camposMeta,
    status: z.enum(META_STATUS).optional(),
  })
  .strict();
export type MetaPatch = z.output<typeof metaPatchSchema>;

export const dataIdrSchema = z.object({ version, dataIdr: dataIso }).strict();
export type DataIdrPut = z.output<typeof dataIdrSchema>;

export const pausarSchema = z.object({ motivo: texto(2000) }).strict();

export const anotacaoSchema = z
  .object({ texto: z.string().trim().min(1, 'Escreva a anotação').max(20_000) })
  .strict();

export const perfilPutSchema = z
  .object({
    userId: z.string().min(1).max(100),
    // Sem null: a aba Perfis só troca o perfil (C7); quem sai é pelo cargo, no Admin do CRM.
    perfil: z.enum(PERFIS),
    admin: z.boolean(),
  })
  .strict();

// Reuniões e contatos (Parte 4). Data e hora chegam como o `datetime-local` da tela, em Brasília.
const dataHora = z.string().refine(dataHoraValida, 'Data e hora inválidas');
const linkReuniao = opc(
  z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v.startsWith('https://'), 'Use um link que comece com https://'),
);
const usuarioId = z.string().min(1).max(100);
const textoReuniao = texto(20_000);

export const reuniaoCriarSchema = z
  .object({
    inscricaoId: z.uuid(),
    tipo: z.enum(REUNIAO_TIPOS),
    conduzidaPor: opc(usuarioId),
    condutorInscricaoId: opc(z.uuid()),
    inicio: dataHora,
    duracaoMin: z.number().int().min(5).max(480).optional(),
    plataforma: opc(z.enum(PLATAFORMAS)),
    link: linkReuniao,
  })
  .strict();
export type ReuniaoCriar = z.output<typeof reuniaoCriarSchema>;

export const reuniaoPatchSchema = z
  .object({
    version,
    status: z.enum(REUNIAO_STATUS).exclude(['REMARCADA']).optional(),
    conduzidaPor: opc(usuarioId),
    condutorInscricaoId: opc(z.uuid()),
    duracaoMin: z.number().int().min(5).max(480).optional(),
    plataforma: opc(z.enum(PLATAFORMAS)),
    link: linkReuniao,
    resumo: textoReuniao,
    metas: textoReuniao,
    combinado: textoReuniao,
    cobrar: textoReuniao,
    trava: textoReuniao,
    anotacaoInterna: textoReuniao,
    humor: opc(z.number().int().min(1).max(5)),
    interesseRenovar: opc(z.boolean()),
    /** "Próxima reunião" do registro: cria a próxima AGENDADA (mesmo tipo e condutor, se omitidos). */
    proxima: z
      .object({ inicio: dataHora, tipo: z.enum(REUNIAO_TIPOS).optional() })
      .strict()
      .optional(),
  })
  .strict();
export type ReuniaoPatch = z.output<typeof reuniaoPatchSchema>;

export const reuniaoRemarcarSchema = z.object({ version, inicio: dataHora }).strict();
export type ReuniaoRemarcar = z.output<typeof reuniaoRemarcarSchema>;

export const agendaSchema = z.object({ dia: data, condutorId: opc(usuarioId) }).strict();
export type AgendaFiltro = z.output<typeof agendaSchema>;

export const controleMensalSchema = z
  .object({
    mes: opc(z.string().refine(mesValido, 'Mês inválido')),
    mentoria: opc(z.enum(MENTORIAS)),
  })
  .strict();
export type ControleMensalFiltro = z.output<typeof controleMensalSchema>;

export const semReuniaoSchema = z.object({ mentoria: opc(z.enum(MENTORIAS)) }).strict();
export type SemReuniaoFiltro = z.output<typeof semReuniaoSchema>;

export const contatoSchema = z
  .object({
    inscricaoId: z.uuid(),
    quando: opc(dataHora),
    canal: z.enum(CANAIS_CONTATO),
    motivo: texto(200),
    respondeu: opc(z.boolean()),
    tempoRespostaMin: opc(z.number().int().min(0).max(100_000)),
    observacao: texto(20_000),
  })
  .strict();
export type ContatoCriar = z.output<typeof contatoSchema>;

export const filaSchema = z
  .object({
    escopo: z.enum(['MINHA', 'EQUIPE']).optional(),
    tipos: z.array(z.enum(FILA_TIPOS)).max(FILA_TIPOS.length).optional(),
  })
  .strict();
export type FilaFiltro = z.output<typeof filaSchema>;

/** A chave é tipo + alvo + data (`agenda-mes:2026-12`), sem dado pessoal. */
export const filaFeitoSchema = z
  .object({ chave: z.string().regex(/^[a-z0-9-]+:[0-9a-f:-]{7,80}$/) })
  .strict();

export const pme1EnviadoSchema = z.object({ enviado: z.boolean() }).strict();

export const mensagemPutSchema = z
  .object({
    momento: z.enum(MOMENTOS_MENSAGEM),
    version,
    textoIndividual: z.string().max(4000),
    textoCasal: z.string().max(4000),
  })
  .strict();
export type MensagemPut = z.output<typeof mensagemPutSchema>;

/** Abas que exportam planilha (§6). Contato só para Admin; dor, sonho e anotações nunca saem. */
export const ABAS_EXPORTACAO = ['MENTORADOS', 'FILA', 'PLANO', 'REUNIOES'] as const;
export const exportarSchema = z
  .object({
    aba: z.enum(ABAS_EXPORTACAO),
    filtros: z
      .object({
        status: z.enum(INSCRICAO_STATUS).optional(),
        mentoria: z.enum(MENTORIAS).optional(),
        responsavelId: z.string().min(1).max(100).optional(),
        escopo: z.enum(['MINHA', 'EQUIPE']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Exportar = z.output<typeof exportarSchema>;

export const transferirCarteiraSchema = z
  .object({ de: z.string().min(1).max(100), para: z.string().min(1).max(100) })
  .strict();
export type TransferirCarteira = z.output<typeof transferirCarteiraSchema>;
