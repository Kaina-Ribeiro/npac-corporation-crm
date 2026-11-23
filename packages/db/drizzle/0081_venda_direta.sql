-- NPAC-65 (Igor, 23/11/2026, "4.1A, 4.3A, 2.1A"): venda direta do SDR, sem reunião, à vista, no cartão
-- ou no boleto. O SDR escolhe o closer e o produto; o lead vai para Venda como "venda a registrar" e o
-- closer escolhido põe o valor. A renda extra da venda vale igual, mas a marcação não tem reunião para
-- apontar: nulo = venda direta.
ALTER TABLE "sdr_sale_marks" ALTER COLUMN "meeting_id" DROP NOT NULL;--> statement-breakpoint
-- Mesma função da 0066 + a venda direta: o SDR põe no lead o closer que escolheu, se o lead não tem
-- reunião realizada e o produto vendido é desse closer (ativo e que fecha venda).
CREATE OR REPLACE FUNCTION leads_guard_owner_columns() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE closer_ok boolean := NEW.closer_id IS NOT DISTINCT FROM OLD.closer_id;
BEGIN
  IF current_user = 'npac_app' AND app_role() IS DISTINCT FROM 'HEAD' THEN
    IF NOT closer_ok AND app_role() = 'SDR' AND NEW.payment_amount_cents IS NULL THEN
      closer_ok := EXISTS (SELECT 1 FROM pipeline_stages s
          WHERE s.id = NEW.stage_id AND s.key = 'AGENDOU_PAGAMENTO')
        AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = NEW.closer_id AND u.active AND u.can_close);
    END IF;
    IF NOT closer_ok AND app_role() = 'SDR' AND NEW.sold_product_id IS NOT NULL THEN
      closer_ok := EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.id = NEW.stage_id AND s.key = 'VENDA')
        AND (
          EXISTS (SELECT 1 FROM meetings m WHERE m.lead_id = NEW.id AND m.closer_id = NEW.closer_id
            AND m.outcome = 'DONE' AND m.canceled_at IS NULL)
          OR (
            NOT EXISTS (SELECT 1 FROM meetings m WHERE m.lead_id = NEW.id
              AND m.outcome = 'DONE' AND m.canceled_at IS NULL)
            AND EXISTS (SELECT 1 FROM products p JOIN "user" u ON u.id = p.closer_id
              WHERE p.id = NEW.sold_product_id AND p.closer_id = NEW.closer_id
                AND p.active AND u.active AND u.can_close)
          )
        );
    END IF;
    IF NOT closer_ok
      OR NEW.sdr_id IS DISTINCT FROM OLD.sdr_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'só HEAD altera SDR, closer, autoria ou exclusão do lead'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Venda a registrar de uma venda direta (marcação ativa sem reunião): o closer registra sem entrada.
-- SECURITY DEFINER: o closer não lê as marcações do SDR; devolve só sim/não, e a API chama apenas para
-- o lead que ele já enxerga.
CREATE FUNCTION lead_direct_sale(p_lead uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT (SELECT app_user_id()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM sdr_sale_marks k
      WHERE k.lead_id = p_lead AND k.canceled_at IS NULL AND k.meeting_id IS NULL)
$$;
--> statement-breakpoint
ALTER FUNCTION lead_direct_sale(uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lead_direct_sale(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lead_direct_sale(uuid) TO npac_app;
