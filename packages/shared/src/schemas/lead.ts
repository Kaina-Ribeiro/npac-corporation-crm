import { z } from 'zod';
import { INCOME_BANDS, LEAD_SOURCES, STAGE_KEYS, TIERS } from '../enums.js';
import { normalizeInstagram, normalizePhoneBR } from '../normalize.js';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const normalized = (label: string, fn: (s: string) => string | null) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .transform((s, ctx) => {
        const out = fn(s);
        if (out === null) {
          ctx.addIssue({ code: 'custom', message: `${label} inválido` });
          return z.NEVER;
        }
        return out;
      })
      .optional(),
  );

export const leadCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: normalized('Telefone', normalizePhoneBR),
    instagram: normalized('Instagram', normalizeInstagram),
    incomeBand: z.enum(INCOME_BANDS),
    source: z.enum(LEAD_SOURCES).default('INSTAGRAM'),
    tier: z.enum(TIERS),
    sdrId: z.string().optional(),
    closerId: z.string().optional(),
    stageKey: z.enum(STAGE_KEYS).default('SONDAGEM'),
    nextContactAt: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .optional(),
    summary: z.string().max(5000).optional(),
  })
  .refine((v) => v.phone !== undefined || v.instagram !== undefined, {
    message: 'Informe telefone ou Instagram',
    path: ['phone'],
  });

export type LeadCreateInput = z.output<typeof leadCreateSchema>;
