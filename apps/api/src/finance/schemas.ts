import { z } from 'zod';
const cents = z.number().int().positive().max(2_000_000_000);
export const saleSchema = z
  .object({
    leadId: z.uuid(),
    productId: z.uuid(),
    closerId: z.string().min(1),
    version: z.number().int().positive(),
    totalCents: cents,
    method: z.enum(['CARD', 'PIX', 'BANK_SLIP', 'PARTIAL']),
    entryCents: z.number().int().min(0).max(2_000_000_000).default(0),
    installments: z
      .array(
        z
          .object({
            amountCents: cents,
            dueAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
          })
          .strict(),
      )
      .max(120)
      .default([]),
    requestKey: z.uuid(),
  })
  .strict();
export const receiptSchema = z
  .object({ version: z.number().int().positive(), requestKey: z.uuid() })
  .strict();
export const reverseSchema = z.object({ version: z.number().int().positive() }).strict();
export type SaleInput = z.output<typeof saleSchema>;
