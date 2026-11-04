import { z } from 'zod';
import { FICHA_CAMPO_CHAVES, LIMITE_REGISTRO_BYTES, MENTORADO_STATUS } from '../mentoria/enums.js';

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
  })
  .strict()
  .refine(cabeNoRegistro, MSG_LIMITE);

export const excluirRegistroSchema = z.object({ version }).strict();

export type CriarMentorado = z.output<typeof criarMentoradoSchema>;
export type AtualizarMentorado = z.output<typeof atualizarMentoradoSchema>;
export type AtualizarFicha = z.output<typeof atualizarFichaSchema>;
