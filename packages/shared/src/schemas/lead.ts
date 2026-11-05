import { z } from 'zod';
import {
  INCOME_BANDS,
  LEAD_SOURCE_OPTIONS,
  LOST_REASON_OTHER_MAX,
  LOST_REASONS,
  SOURCE_OTHER_MAX,
  STAGE_KEY_PATTERN,
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

/**
 * Reunião pedida pelos Agendados (NPAC-38): criada junto com o lead ou a troca de etapa, com a
 * origem da etapa (Direto/Follow). Mesmas regras do POST /meetings: horário futuro, closer ativo.
 */
export const stageMeetingSchema = z
  .object({
    scheduledAt: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .refine((d) => d.getTime() > Date.now(), 'Escolha um horário futuro'),
    closerId: z.string().min(1, 'Escolha o closer da reunião'),
  })
  .strict();

/**
 * Campos que cada etapa pede (NPAC-38). Aqui só o formato; quando são exigidos (409
 * `MEETING_REQUIRED`, `PAYMENT_REQUIRED`, `REASON_REQUIRED`) a API decide pela etapa.
 */
export const stageFieldsShape = {
  meeting: stageMeetingSchema.optional(),
  /** Agendou Pagamento: produto e valor combinados (centavos); a data vai em `nextContactAt`. */
  paymentProductId: z.uuid().optional(),
  paymentAmountCents: z.number().int().positive().optional(),
  /** Sem Perfil: motivo; "Outro" pede o texto. */
  lostReason: z.enum(LOST_REASONS).optional(),
  lostReasonOther: z.preprocess(
    blankToUndefined,
    z.string().trim().max(LOST_REASON_OTHER_MAX).optional(),
  ),
};

export const leadCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: normalized('Telefone', normalizePhoneBR),
    instagram: normalized('Instagram', normalizeInstagram),
    incomeBand: z.enum(INCOME_BANDS),
    // Cadastro só oferece a lista atual; as antigas (Instagram, WhatsApp) ficam nos leads existentes.
    source: z.enum(LEAD_SOURCE_OPTIONS, { error: 'Escolha a origem' }),
    sourceOther: z.preprocess(blankToUndefined, z.string().trim().max(SOURCE_OTHER_MAX).optional()),
    // Sem `tier`: o perfil vem da faixa de renda (TIER_BY_INCOME_BAND, gatilho no banco).
    sdrId: z.string().optional(),
    closerId: z.string().optional(),
    stageKey: stageKeySchema.default('SONDAGEM'),
    nextContactAt: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .optional(),
    summary: z.string().max(5000).optional(),
    ...stageFieldsShape,
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
