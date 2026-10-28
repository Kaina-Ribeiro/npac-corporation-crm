import { ConflictException } from '@nestjs/common';
export function financialConflict(error: unknown): never {
  const e = error as { code?: string; cause?: { code?: string } };
  if ((e.cause?.code ?? e.code) === '23505')
    throw new ConflictException('Requisição financeira já registrada.');
  throw error;
}
