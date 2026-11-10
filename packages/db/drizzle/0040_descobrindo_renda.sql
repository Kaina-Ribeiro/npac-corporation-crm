-- "Descobrindo renda" (Igor, 10/11/2026, "1C"): faixa de renda e perfil próprios para o lead cuja
-- renda ainda não se sabe. Ao trocar a faixa, o gatilho da 0036 recalcula o perfil.
ALTER TYPE "public"."income_band" ADD VALUE 'DESCOBRINDO';--> statement-breakpoint
ALTER TYPE "public"."tier" ADD VALUE 'DESCOBRINDO';--> statement-breakpoint
-- Valor novo de enum não vale na mesma transação: comparar como texto e converter só na execução
-- (plpgsql não avalia o corpo ao criar). Mesma tabela de `TIER_BY_INCOME_BAND` (sh/enums.ts).
CREATE OR REPLACE FUNCTION lead_tier_for_income(band income_band) RETURNS tier
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  RETURN (CASE band::text
    WHEN 'R5_8K' THEN 'P2'
    WHEN 'R8_15K' THEN 'P1'
    WHEN 'R15_50K' THEN 'P0'
    WHEN 'R50K_PLUS' THEN 'P0'
    WHEN 'DESCOBRINDO' THEN 'DESCOBRINDO'
  END)::tier;
END $$;
