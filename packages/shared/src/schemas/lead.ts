import { z } from 'zod';
import {
  INCOME_BANDS,
  LEAD_SOURCE_OPTIONS,
  SOURCE_OTHER_MAX,
  STAGE_KEY_PATTERN,
  TIERS,
} from '../enums.js';
import { normalizeInstagram, normalizePhoneBR } from '../normalize.js';

/** Etapa por chave; a existência é conferida no banco ("Etapa inexistente"). */
export const stageKeySchema = z.string().regex(STAGE_KEY_PATTERN);

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
    // Cadastro só oferece a lista atual; as antigas (Instagram, WhatsApp) ficam nos leads existentes.
    source: z.enum(LEAD_SOURCE_OPTIONS, { error: 'Escolha a origem' }),
    sourceOther: z.preprocess(blankToUndefined, z.string().trim().max(SOURCE_OTHER_MAX).optional()),
    tier: z.enum(TIERS),
    sdrId: z.string().optional(),
    closerId: z.string().optional(),
    stageKey: stageKeySchema.default('SONDAGEM'),
    nextContactAt: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .optional(),
    summary: z.string().max(5000).optional(),
  })
  .refine((v) => v.phone !== undefined || v.instagram !== undefined, {
    message: 'Informe telefone ou Instagram',
    path: ['phone'],
  })
  // O texto só acompanha "Outro"; nas demais origens a API descarta.
  .refine((v) => v.source !== 'OUTRO' || v.sourceOther !== undefined, {
    message: 'Escreva qual é a origem',
    path: ['sourceOther'],
  });

export type LeadCreateInput = z.output<typeof leadCreateSchema>;
