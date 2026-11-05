import { z } from 'zod';
import { LEAD_SOURCES } from '../enums.js';
import { leadCreateSchema } from './lead.js';

const f = leadCreateSchema.shape;
export const leadUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    name: f.name.optional(),
    phone: f.phone.nullable(),
    instagram: f.instagram.nullable(),
    incomeBand: f.incomeBand.optional(),
    // Aceita as antigas para o lead que já está nelas; trocar para uma antiga a API recusa.
    source: z.enum(LEAD_SOURCES).optional(),
    sourceOther: f.sourceOther.nullable(),
    // Perfil não se troca à mão: muda junto com `incomeBand` (strict recusa `tier`).
    stageKey: f.stageKey.removeDefault().optional(),
    sdrId: f.sdrId,
    closerId: f.closerId.nullable(),
    nextContactAt: f.nextContactAt.nullable(),
    summary: f.summary.nullable(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, 'Informe uma alteração');

export type LeadUpdateInput = z.output<typeof leadUpdateSchema>;
