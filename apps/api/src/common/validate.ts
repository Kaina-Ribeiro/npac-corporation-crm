import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';

export function validate<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException({ message: 'Dados inválidos', issues: z.flattenError(r.error) });
  return r.data;
}
export function entityId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw new NotFoundException();
  return id;
}
