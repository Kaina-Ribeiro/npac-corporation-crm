import { z } from 'zod';
import { DIAGNOSTICO_CHAVES } from './campos.js';
import { FICHA_CAMPO_CHAVES, MENTORADO_STATUS } from './enums.js';

/**
 * `.json` oficial de backup do Acompanhamento (D6): um arquivo por módulo, que restaura a base
 * desse módulo. Formato próprio do CRM (`npac-acompanhamento` v1). O `.json` da ferramenta
 * antiga precisa de adaptador quando a estrutura chegar (P3). Mídia em arquivo não vai no
 * `.json` (fica no volume e no backup cifrado): só a lista, para o relatório (D42).
 */
export const MODULOS = ['dashboard', 'linha-do-tempo', 'rdv'] as const;
export type Modulo = (typeof MODULOS)[number];
export const FORMATO_BACKUP = 'npac-acompanhamento';

const t = z.string().max(300_000).nullable().optional();
const id = z.uuid();
const midia = z
  .object({
    donoTipo: z.string().max(40),
    donoId: id,
    tipo: z.enum(['FOTO', 'VIDEO', 'PDF', 'LINK_VIDEO']),
    urlVideo: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const registroDashboard = z
  .object({
    id,
    nome: z.string().max(200),
    tipoCadastro: t,
    tipoMentoria: t,
    dataEntrada: t,
    status: z.enum(MENTORADO_STATUS),
  })
  .strict();

export const registroFicha = z
  .object({
    id,
    nome: z.string().max(200),
    dataInicio: t,
    notasMomentoInicial: t,
    notasMomentoAtual: t,
    tempoMentoria: t,
    campos: z.partialRecord(z.enum(FICHA_CAMPO_CHAVES), z.object({ antes: t, depois: t }).strict()),
    conquistas: z.array(z.object({ id, data: t, descricao: t }).strict()).max(2000),
    midias: z.array(midia).max(5000),
  })
  .strict();

export const registroRdv = z
  .object({
    id,
    nome: z.string().max(200),
    pastaUrl: z.string().max(2000).nullable().optional(),
    diagnostico: z.partialRecord(z.enum(DIAGNOSTICO_CHAVES), z.string().max(300_000).nullable()),
    eventos: z
      .array(
        z
          .object({
            id,
            data: z.string().max(40),
            descricao: t,
            origem: z.enum(['MANUAL', 'COLADO', 'DUVIDA_CONFIRMADA']),
            checklistItem: z.number().int().min(1).max(9).nullable().optional(),
          })
          .strict(),
      )
      .max(5000),
    duvidas: z
      .array(
        z.object({ id, texto: t, status: z.enum(['ABERTA', 'CONFIRMADA', 'DESCARTADA']) }).strict(),
      )
      .max(5000),
    quadros: z
      .array(
        z
          .object({
            id,
            quadro: z.enum([
              'EVENTOS_PRESENCIAIS',
              'INVESTIMENTO_ATIVOS',
              'IMOVEL_LEILAO',
              'MERCADO_IMOBILIARIO',
            ]),
            data: t,
            descricao: t,
          })
          .strict(),
      )
      .max(5000),
    midias: z.array(midia).max(5000),
  })
  .strict();

const cabecalho = {
  formato: z.literal(FORMATO_BACKUP),
  versao: z.literal(1),
  exportadoEm: z.string().max(40),
};

export const backupSchema = z.discriminatedUnion('modulo', [
  z
    .object({
      ...cabecalho,
      modulo: z.literal('dashboard'),
      registros: z.array(registroDashboard).max(25_000),
    })
    .strict(),
  z
    .object({
      ...cabecalho,
      modulo: z.literal('linha-do-tempo'),
      registros: z.array(registroFicha).max(25_000),
    })
    .strict(),
  z
    .object({ ...cabecalho, modulo: z.literal('rdv'), registros: z.array(registroRdv).max(25_000) })
    .strict(),
]);
export type BackupJson = z.output<typeof backupSchema>;
export type RegistroDashboard = z.output<typeof registroDashboard>;
export type RegistroFicha = z.output<typeof registroFicha>;
export type RegistroRdv = z.output<typeof registroRdv>;

/** Nome do arquivo exportado: só módulo e data, nunca nome de pessoa. */
export const nomeArquivoBackup = (modulo: Modulo, hojeIso: string) =>
  `acompanhamento-${modulo}-${hojeIso.slice(0, 10)}.json`;
