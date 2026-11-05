import { z } from 'zod';
import {
  DATA_COMPLETA,
  FICHA_CAMPO_CHAVES,
  LIMITE_REGISTRO_BYTES,
  MENTORADO_STATUS,
  QUADRO_CHAVES,
} from '../mentoria/enums.js';
import { parseData } from '../mentoria/datas.js';
import { linkPermitido } from '../mentoria/links.js';

/**
 * Regra principal do PDF: texto colado é gravado como veio, só sem espaços nas bordas. Nada de
 * conversão de valor, faixa ou data inventada. Campos de fonte (pasta, diagnóstico, data de
 * item de quadro) não existem aqui: `.strict()` recusa com 400.
 */
const texto = (max = LIMITE_REGISTRO_BYTES) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim());
const nome = z.string().trim().min(1, 'Informe o nome').max(200);
const version = z.number().int().positive();

/** Bytes em UTF-8 sem depender de Buffer nem TextEncoder (roda na API e no navegador). */
function utf8Bytes(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Soma em bytes dos textos de um objeto (aninhado): base do limite de 256 KB por registro. */
export function bytesDeTexto(v: unknown): number {
  if (typeof v === 'string') return utf8Bytes(v);
  if (Array.isArray(v)) return v.reduce<number>((s, x) => s + bytesDeTexto(x), 0);
  if (v && typeof v === 'object')
    return Object.values(v).reduce<number>((s, x) => s + bytesDeTexto(x), 0);
  return 0;
}
const cabeNoRegistro = (v: unknown) => bytesDeTexto(v) <= LIMITE_REGISTRO_BYTES;
export const MSG_LIMITE_REGISTRO = 'Registro acima do limite de 256 KB';
const MSG_LIMITE = MSG_LIMITE_REGISTRO;

export const criarMentoradoSchema = z
  .object({
    nome,
    tipoCadastro: texto(200).optional(),
    tipoMentoria: texto(200).optional(),
    dataEntrada: texto(40).optional(),
    status: z.enum(MENTORADO_STATUS),
  })
  .strict();

export const atualizarMentoradoSchema = z
  .object({
    version,
    nome: nome.optional(),
    tipoCadastro: texto(200).nullable().optional(),
    tipoMentoria: texto(200).nullable().optional(),
    dataEntrada: texto(40).nullable().optional(),
    status: z.enum(MENTORADO_STATUS).optional(),
  })
  .strict();

const campoFicha = z
  .object({ antes: texto().nullable().optional(), depois: texto().nullable().optional() })
  .strict();

export const atualizarFichaSchema = z
  .object({
    version,
    nome: nome.optional(),
    dataInicio: texto(40).nullable().optional(),
    notasMomentoInicial: texto().nullable().optional(),
    notasMomentoAtual: texto().nullable().optional(),
    tempoMentoria: texto(2000).nullable().optional(),
    campos: z.partialRecord(z.enum(FICHA_CAMPO_CHAVES), campoFicha).optional(),
    /** Conquistas desta ficha (data e descrição), com a version da ficha (D5). */
    conquistas: z
      .record(
        z.uuid(),
        z
          .object({
            data: texto(40).nullable().optional(),
            descricao: texto().nullable().optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .refine(cabeNoRegistro, MSG_LIMITE);

export const criarFichaSchema = z.object({ nome, dataInicio: texto(40) }).strict();
export const versionSchema = z.object({ version }).strict();

export const excluirRegistroSchema = z.object({ version }).strict();

/** RDV (Módulo 3): nome é o único campo editável direto; pasta e diagnóstico só por "Colar". */
export const criarRdvSchema = z.object({ nome }).strict();
/** Data de evento: `DD/MM/AAAA` real (regra 4). */
const dataEvento = z
  .string()
  .trim()
  .refine((s) => DATA_COMPLETA.test(s) && !!parseData(s).data, 'Use a data no formato DD/MM/AAAA');
/** Data de item de quadro: opcional, `MM/AAAA` ou `DD/MM/AAAA` (D34). */
const dataQuadro = z
  .string()
  .trim()
  .refine((s) => !s || !!parseData(s).data, 'Use MM/AAAA ou DD/MM/AAAA');

export const atualizarRdvSchema = z
  .object({
    version,
    nome: nome.optional(),
    /** Eventos desta pessoa (data e descrição), com a version da pessoa (D5). */
    eventos: z
      .record(
        z.uuid(),
        z
          .object({ data: dataEvento.optional(), descricao: texto().nullable().optional() })
          .strict(),
      )
      .optional(),
    /** Itens de quadro: só a descrição muda; a data é de fonte (D34). */
    quadros: z
      .record(z.uuid(), z.object({ descricao: texto().nullable().optional() }).strict())
      .optional(),
  })
  .strict()
  .refine(cabeNoRegistro, MSG_LIMITE);
export const novoEventoSchema = z
  .object({ version, data: dataEvento, descricao: texto() })
  .strict()
  .refine(cabeNoRegistro, MSG_LIMITE);
export const previaEventosSchema = z
  .object({ texto: z.string().max(LIMITE_REGISTRO_BYTES) })
  .strict();
/** Gravação da colagem: só Evento e Quadro (Eventos presenciais); dúvida não é gravada. */
export const colarEventosSchema = z
  .object({
    version,
    linhas: z
      .array(
        z
          .object({
            tipo: z.enum(['EVENTO', 'QUADRO']),
            data: z.string().trim().max(40),
            descricao: texto(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .refine(cabeNoRegistro, MSG_LIMITE);
export const novoQuadroSchema = z
  .object({
    version,
    quadro: z.enum(QUADRO_CHAVES),
    data: dataQuadro.optional(),
    descricao: texto(),
  })
  .strict()
  .refine(cabeNoRegistro, MSG_LIMITE);
export const previaDiagnosticoSchema = z
  .object({ texto: z.string().max(LIMITE_REGISTRO_BYTES) })
  .strict();
export const colarDiagnosticoSchema = z
  .object({ version, texto: z.string().max(LIMITE_REGISTRO_BYTES) })
  .strict();
export const colarLinkSchema = z
  .object({
    version,
    url: z
      .string()
      .trim()
      .max(2000)
      .refine(linkPermitido, 'Link não aceito: use um link do Google Drive, YouTube ou Vimeo'),
  })
  .strict();

export type CriarMentorado = z.output<typeof criarMentoradoSchema>;
export type AtualizarMentorado = z.output<typeof atualizarMentoradoSchema>;
export type AtualizarFicha = z.output<typeof atualizarFichaSchema>;
export type CriarFicha = z.output<typeof criarFichaSchema>;
export type CriarRdv = z.output<typeof criarRdvSchema>;
export type AtualizarRdv = z.output<typeof atualizarRdvSchema>;
export type ColarEventos = z.output<typeof colarEventosSchema>;
export type NovoQuadro = z.output<typeof novoQuadroSchema>;
