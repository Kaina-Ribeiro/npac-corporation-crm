import { z } from 'zod';
import { leadCreateSchema } from './lead.js';

const f = leadCreateSchema.shape;
export const leadUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    name: f.name.optional(),
    phone: f.phone.nullable(),
    instagram: f.instagram.nullable(),
    incomeBand: f.incomeBand.optional(),
    source: f.source.removeDefault().optional(),
    tier: f.tier.optional(),
    stageKey: f.stageKey.removeDefault().optional(),
    sdrId: f.sdrId,
    closerId: f.closerId.nullable(),
    nextContactAt: f.nextContactAt.nullable(),
    summary: f.summary.nullable(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, 'Informe uma alteração');

export type LeadUpdateInput = z.output<typeof leadUpdateSchema>;
