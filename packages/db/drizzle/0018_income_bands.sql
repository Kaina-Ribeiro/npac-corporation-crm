-- Faixas de renda corrigidas: 5–8, 8–15, 15–50 e 50 mil+. Renomeia os valores do tipo para
-- preservar os leads existentes (5–10 → 5–8, 10–20 → 8–15, 20–50 → 15–50); revise os casos
-- de fronteira no CRM se houver dados reais anteriores a esta migration.
ALTER TYPE "public"."income_band" RENAME VALUE 'R5_10K' TO 'R5_8K';--> statement-breakpoint
ALTER TYPE "public"."income_band" RENAME VALUE 'R10_20K' TO 'R8_15K';--> statement-breakpoint
ALTER TYPE "public"."income_band" RENAME VALUE 'R20_50K' TO 'R15_50K';
