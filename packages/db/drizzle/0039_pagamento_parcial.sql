ALTER TABLE "leads" ADD COLUMN "payment_entry_cents" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "sold_product_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sold_product_id_products_id_fk" FOREIGN KEY ("sold_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_payment_entry_check" CHECK ("leads"."payment_entry_cents" is null or ("leads"."payment_amount_cents" is not null and "leads"."payment_entry_cents" > 0 and "leads"."payment_entry_cents" < "leads"."payment_amount_cents"));--> statement-breakpoint
-- NPAC-41: o closer grava a entrada do Agendou Pagamento junto da troca de etapa (como os demais
-- dados da 0037) e, ao registrar a venda a registrar (o lead continua em Venda), apaga o produto
-- informado no cadastro. Sem trocar a etapa, continua só podendo mover o lead.
CREATE OR REPLACE FUNCTION leads_guard_closer_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE allowed text[] := ARRAY['stage_id','version','updated_at'];
BEGIN
  IF current_user = 'npac_app' AND app_role() = 'CLOSER' THEN
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      allowed := allowed || ARRAY['payment_product_id','payment_amount_cents','payment_entry_cents',
        'lost_reason','lost_reason_other','next_contact_at','sold_product_id'];
    ELSIF NEW.sold_product_id IS NULL THEN
      allowed := allowed || ARRAY['sold_product_id'];
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'closer só pode mover a etapa do lead' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;
