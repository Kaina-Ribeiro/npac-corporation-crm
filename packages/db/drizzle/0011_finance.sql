CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"catalog_price_cents" integer NOT NULL,
	"closer_id" text NOT NULL,
	"sdr_id" text NOT NULL,
	"total_cents" integer NOT NULL,
	"method" text NOT NULL,
	"request_key" uuid NOT NULL,
	"created_by" text NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "deals_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "deal_positive_total" CHECK ("deals"."total_cents" > 0 and "deals"."catalog_price_cents" > 0),
	CONSTRAINT "deal_method" CHECK ("deals"."method" in ('CARD','PIX','BANK_SLIP','PARTIAL')),
	CONSTRAINT "deal_reversal_pair" CHECK (("deals"."reversed_at" is null) = ("deals"."reversed_by" is null))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" text,
	"receipt_key" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payments_receipt_key_unique" UNIQUE("receipt_key"),
	CONSTRAINT "payment_positive_amount" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payment_receipt_pair" CHECK (("payments"."paid_at" is null) = ("payments"."paid_by" is null) and ("payments"."paid_at" is null) = ("payments"."receipt_key" is null))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"closer_id" text NOT NULL,
	"price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code"),
	CONSTRAINT "product_positive_price" CHECK ("products"."price_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_closer_id_user_id_fk" FOREIGN KEY ("closer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_sdr_id_user_id_fk" FOREIGN KEY ("sdr_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_closer_id_user_id_fk" FOREIGN KEY ("closer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_lead_idx" ON "deals" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "deals_closed_idx" ON "deals" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "payments_deal_idx" ON "payments" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "payments_due_idx" ON "payments" USING btree ("due_at");--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_read ON products FOR SELECT USING ((SELECT app_user_id()) IS NOT NULL);
GRANT SELECT ON products TO npac_app;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals FORCE ROW LEVEL SECURITY;
CREATE POLICY deals_read ON deals FOR SELECT USING (
  (SELECT app_role()) = 'HEAD' OR
  (lead_id IN (SELECT id FROM leads) AND
    (((SELECT app_role()) = 'SDR' AND sdr_id = (SELECT app_user_id()))
    OR ((SELECT app_role()) = 'CLOSER' AND closer_id = (SELECT app_user_id()))))
);
CREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (
  created_by = (SELECT app_user_id()) AND lead_id IN (SELECT id FROM leads WHERE deleted_at IS NULL)
  AND sdr_id = (SELECT l.sdr_id FROM leads l WHERE l.id = lead_id)
  AND EXISTS (SELECT 1 FROM products p JOIN "user" u ON u.id = p.closer_id
    WHERE p.id = deals.product_id AND p.closer_id = deals.closer_id AND p.active AND u.active AND u.can_close)
);
CREATE POLICY deals_update ON deals FOR UPDATE USING ((SELECT app_role()) = 'HEAD');
GRANT SELECT, INSERT, UPDATE ON deals TO npac_app;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_read ON payments FOR SELECT USING (deal_id IN (SELECT id FROM deals));
CREATE POLICY payments_insert ON payments FOR INSERT WITH CHECK (deal_id IN (SELECT id FROM deals WHERE reversed_at IS NULL));
CREATE POLICY payments_update ON payments FOR UPDATE USING (deal_id IN (SELECT id FROM deals WHERE reversed_at IS NULL));
GRANT SELECT, INSERT, UPDATE ON payments TO npac_app;
--> statement-breakpoint
CREATE FUNCTION finance_guard_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user = 'npac_app' THEN
   IF TG_TABLE_NAME = 'deals' THEN
     IF (to_jsonb(NEW) - ARRAY['reversed_at','reversed_by','version']) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['reversed_at','reversed_by','version'])
        OR OLD.reversed_at IS NOT NULL OR NEW.reversed_at IS NULL OR NEW.reversed_by IS DISTINCT FROM app_user_id()
     THEN RAISE EXCEPTION 'venda imutável; apenas estorno HEAD' USING ERRCODE='42501'; END IF;
   ELSE
     IF (to_jsonb(NEW) - ARRAY['paid_at','paid_by','receipt_key','version']) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['paid_at','paid_by','receipt_key','version'])
        OR OLD.paid_at IS NOT NULL OR NEW.paid_at IS NULL OR NEW.paid_by IS DISTINCT FROM app_user_id()
     THEN RAISE EXCEPTION 'parcela imutável; apenas baixa' USING ERRCODE='42501'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER deals_immutable BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION finance_guard_immutable();
CREATE TRIGGER payments_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION finance_guard_immutable();
