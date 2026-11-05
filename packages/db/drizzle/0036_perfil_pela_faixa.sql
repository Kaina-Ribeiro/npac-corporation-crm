-- Perfil do lead sempre pela faixa de renda (pedido do cliente, Igor, 05/11/2026):
-- 5–8 mil = P2, 8–15 mil = P1, 15 mil para cima = P0. Sem troca à mão: o gatilho reescreve o
-- perfil em todo cadastro e em toda troca de faixa ou perfil. Mesma tabela de `TIER_BY_INCOME_BAND`
-- (packages/shared/src/enums.ts): faixa nova pede as duas.
CREATE FUNCTION lead_tier_for_income(band income_band) RETURNS tier
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE band
    WHEN 'R5_8K' THEN 'P2'::tier
    WHEN 'R8_15K' THEN 'P1'::tier
    WHEN 'R15_50K' THEN 'P0'::tier
    WHEN 'R50K_PLUS' THEN 'P0'::tier
  END
$$;
--> statement-breakpoint
CREATE FUNCTION leads_tier_from_income() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.tier := coalesce(lead_tier_for_income(NEW.income_band), NEW.tier);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER leads_tier_from_income BEFORE INSERT OR UPDATE OF income_band, tier ON leads
FOR EACH ROW EXECUTE FUNCTION leads_tier_from_income();
--> statement-breakpoint
-- Leads que já existem passam a seguir a faixa (resposta "2B" do cliente). Valor das reuniões
-- realizadas segue o perfil atual, então os relatórios antigos mudam junto, como combinado.
UPDATE leads SET tier = lead_tier_for_income(income_band)
WHERE tier IS DISTINCT FROM lead_tier_for_income(income_band);
