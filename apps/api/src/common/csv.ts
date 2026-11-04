import type { FastifyReply } from 'fastify';

/** Célula CSV com fórmula neutralizada (`=`, `+`, `-`, `@` no início viram texto). */
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Linhas → CSV com BOM (Excel abre com acento) e `;` (padrão BR). */
export const toCsv = (rows: unknown[][]) =>
  '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');

/**
 * Cabeçalhos de download só depois de gerar o arquivo: com `@Header` fixo, um erro de validação
 * (objeto JSON) saía com `text/csv` e o Fastify respondia 500 em vez do 400.
 */
export function csvHeaders(reply: FastifyReply, filename: string) {
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
}
