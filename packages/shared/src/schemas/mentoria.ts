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
import { linkPermitido } from '../mentoria/links.js';

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

export const anotacaoSchema = z
  .object({ texto: z.string().trim().min(1, 'Escreva a anotação').max(20_000) })
  .strict();

export const perfilPutSchema = z
  .object({
    userId: z.string().min(1).max(100),
    perfil: z.enum(PERFIS).nullable(),
    admin: z.boolean(),
  })
  .strict();
