CREATE TABLE "sdr_sale_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"sdr_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"bonus_cents" integer NOT NULL,
	"marked_by" text NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "sdr_sale_mark_bonus" CHECK ("sdr_sale_marks"."bonus_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sdr_bonus_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sdr_sale_marks" ADD CONSTRAINT "sdr_sale_marks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdr_sale_marks" ADD CONSTRAINT "sdr_sale_marks_sdr_id_user_id_fk" FOREIGN KEY ("sdr_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdr_sale_marks" ADD CONSTRAINT "sdr_sale_marks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdr_sale_marks" ADD CONSTRAINT "sdr_sale_marks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdr_sale_marks" ADD CONSTRAINT "sdr_sale_marks_marked_by_user_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sdr_sale_marks_one_active" ON "sdr_sale_marks" USING btree ("lead_id") WHERE "sdr_sale_marks"."canceled_at" is null;--> statement-breakpoint
CREATE INDEX "sdr_sale_marks_sdr_idx" ON "sdr_sale_marks" USING btree ("sdr_id","marked_at");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_sdr_bonus" CHECK ("products"."sdr_bonus_cents" >= 0);--> statement-breakpoint
-- NPAC-48 (Igor, 17/11/2026): o SDR marca a venda depois da reunião realizada, só com o produto.
-- Cada marcação dá ao SDR a renda extra do produto (1A: conta na data da marcação). Leitura: o
-- próprio SDR e a liderança; gravação só pela API (quem marca = quem está logado, lead visível e
-- SDR = o dono do lead). Sem UPDATE/DELETE para npac_app: a saída é pelos gatilhos abaixo.
ALTER TABLE sdr_sale_marks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sdr_sale_marks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sdr_sale_marks_read ON sdr_sale_marks FOR SELECT
  USING ((select app_role()) = 'HEAD' OR sdr_id = (select app_user_id()));
--> statement-breakpoint
CREATE POLICY sdr_sale_marks_insert ON sdr_sale_marks FOR INSERT
  WITH CHECK (marked_by = (select app_user_id())
    AND sdr_id = (SELECT l.sdr_id FROM leads l WHERE l.id = lead_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON sdr_sale_marks TO npac_app;
--> statement-breakpoint
-- A renda sai quando o lead deixa a Venda (inclusive pelo estorno, que devolve a etapa anterior) ou
-- é excluído. SECURITY DEFINER: npac_app não atualiza a tabela.
CREATE FUNCTION sdr_sale_marks_lead_left() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM pipeline_stages s WHERE s.id = NEW.stage_id AND s.key = 'VENDA'
  ) THEN
    UPDATE sdr_sale_marks SET canceled_at = now() WHERE lead_id = NEW.id AND canceled_at IS NULL;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER leads_sdr_sale_marks AFTER UPDATE OF stage_id, deleted_at ON leads
  FOR EACH ROW
  WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION sdr_sale_marks_lead_left();
--> statement-breakpoint
-- Venda estornada: a renda da marcação sai mesmo que o lead continue em Venda.
CREATE FUNCTION sdr_sale_marks_deal_reversed() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE sdr_sale_marks SET canceled_at = now() WHERE lead_id = NEW.lead_id AND canceled_at IS NULL;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER deals_sdr_sale_marks AFTER UPDATE OF reversed_at ON deals
  FOR EACH ROW WHEN (OLD.reversed_at IS NULL AND NEW.reversed_at IS NOT NULL)
  EXECUTE FUNCTION sdr_sale_marks_deal_reversed();
--> statement-breakpoint
REVOKE ALL ON FUNCTION sdr_sale_marks_lead_left() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sdr_sale_marks_deal_reversed() FROM PUBLIC;
--> statement-breakpoint
-- Mesma função da 0043 + NPAC-48: ao marcar a venda, o SDR passa o lead ao closer da reunião
-- realizada (o closer da venda, como no cadastro em Venda Fechada).
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
        AND EXISTS (SELECT 1 FROM meetings m WHERE m.lead_id = NEW.id AND m.closer_id = NEW.closer_id
          AND m.outcome = 'DONE' AND m.canceled_at IS NULL);
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
-- Valores do Igor (17/11/2026, "2A"), pelo código do catálogo ou pelo nome (Nação 2500/3000/3500 =
-- Promocional/Padrão ou Normal/Completo ou Cheio). Produto que não bater fica com R$ 0 até a
-- liderança preencher em Admin > Catálogo.
UPDATE products p SET sdr_bonus_cents = v.cents
FROM (VALUES
  ('NACAO_PROMO', 'Nação Promocional', NULL, 500),
  ('NACAO_PADRAO', 'Nação Padrão', 'Nação Normal', 1000),
  ('NACAO_COMPLETO', 'Nação Completo', 'Nação Cheio', 2000),
  ('RDV', 'Mentoria RDV', NULL, 7000),
  ('MENTORIA_2M', 'Mentoria 2M', NULL, 9000),
  ('MENTORIA_6M', 'Mentoria 6M', NULL, 12000)
) AS v(code, name, alias, cents)
WHERE p.code = v.code OR p.name = v.name OR p.name = v.alias;
