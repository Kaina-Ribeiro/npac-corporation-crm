import { MSG_LIMITE_REGISTRO } from '@npac/shared';
import { z } from 'zod';
import { validate } from '../common/validate.js';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

export const MSG_CONFLITO =
  'Este registro foi alterado por outra pessoa. Recarregue e tente de novo.';

export const conflitoDeVersao = () =>
  new ConflictException({ code: 'VERSION_CONFLICT', message: MSG_CONFLITO });

type PgLike = { code?: string; message?: string; constraint_name?: string; cause?: PgLike };

/**
 * Traduz erros do Postgres das funções e checks do módulo para respostas em português.
 * P0409 = conflito de version; P0002/42501 = 404 (o módulo não se revela); 22023 = regra de
 * negócio com mensagem pronta; 23505 = nome repetido; 23514 = dado fora do formato.
 */
export function erroDoBanco(
  e: unknown,
  nomeRepetido = 'Já existe um registro com este nome',
): never {
  if (e instanceof HttpException) throw e;
  const pg = (e as PgLike)?.cause?.code ? (e as PgLike).cause! : (e as PgLike);
  switch (pg?.code) {
    case 'P0409':
      throw conflitoDeVersao();
    case 'P0002':
    case '42501':
      throw new NotFoundException();
    case '22023':
      throw new BadRequestException(pg.message ?? 'Dados inválidos');
    case '23505':
      throw new ConflictException(nomeRepetido);
    case '23514':
      throw new BadRequestException('Dados inválidos');
    default:
      throw e;
  }
}

/** Como `validate`, mas o estouro do limite de 256 KB responde com a mensagem própria. */
export function validarRegistro<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success && r.error.issues.some((i) => i.message === MSG_LIMITE_REGISTRO))
    throw new BadRequestException(MSG_LIMITE_REGISTRO);
  return validate(schema, input);
}

/**
 * Como `validarRegistro`, mas a regra própria do módulo (refine com mensagem: link fora da
 * lista, data fora do formato) responde com a mensagem em português para a tela mostrar.
 */
export function validarComAviso<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  const aviso = r.success ? undefined : r.error.issues.find((i) => i.code === 'custom');
  if (aviso) throw new BadRequestException(aviso.message);
  return validate(schema, input);
}
