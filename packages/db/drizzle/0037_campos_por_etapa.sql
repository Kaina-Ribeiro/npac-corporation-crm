CREATE TYPE "public"."lead_lost_reason" AS ENUM('SEM_RENDA', 'SEM_INTERESSE', 'NAO_RESPONDEU', 'OUTRO');--> statement-breakpoint
ALTER TABLE "lead_timeline" DROP CONSTRAINT "timeline_fields_allowed";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "payment_product_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "payment_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_reason" "lead_lost_reason";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_reason_other" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_payment_product_id_products_id_fk" FOREIGN KEY ("payment_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_payment_check" CHECK (("leads"."payment_product_id" is null) = ("leads"."payment_amount_cents" is null) and ("leads"."payment_amount_cents" is null or "leads"."payment_amount_cents" > 0));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_lost_reason_other_check" CHECK ("leads"."lost_reason_other" is null or ("leads"."lost_reason" = 'OUTRO' and char_length("leads"."lost_reason_other") between 1 and 80));--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "timeline_fields_allowed" CHECK ("lead_timeline"."fields" <@ ARRAY['name','phone','instagram','incomeBand','source','tier','stageKey','sdrId','closerId','nextContactAt','summary','body','title','dueAt','completedAt','assigneeId','scheduledAt','origin','outcome','canceledAt','step','payment','lostReason']::text[]);--> statement-breakpoint
-- Closer marca Agendou Pagamento e Sem Perfil depois da reunião (NPAC-38): junto com a troca de
-- etapa, aceita também os dados dela (pagamento, motivo, próximo contato). Sem trocar a etapa,
-- continua só podendo mover o lead, como na 0005.
CREATE OR REPLACE FUNCTION leads_guard_closer_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE allowed text[] := ARRAY['stage_id','version','updated_at'];
BEGIN
  IF current_user = 'npac_app' AND app_role() = 'CLOSER' THEN
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      allowed := allowed || ARRAY['payment_product_id','payment_amount_cents','lost_reason',
        'lost_reason_other','next_contact_at'];
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'closer só pode mover a etapa do lead' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- LGPD: o texto do motivo "Outro" é texto livre do titular (mesma função da 0035 + lost_reason_other).
CREATE OR REPLACE FUNCTION lgpd_anonymize(target uuid, actor text, reason text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE active_sale boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = target AND d.reversed_at IS NULL) INTO active_sale;
  UPDATE leads SET name = 'Titular anonimizado', phone_enc = NULL, phone_bidx = NULL, instagram = NULL,
    summary = NULL, source_other = NULL, lost_reason_other = NULL, next_contact_at = NULL,
    anonymized_at = now(), updated_at = now(), version = version + 1,
    deleted_at = CASE WHEN active_sale THEN deleted_at ELSE coalesce(deleted_at, now()) END
  WHERE id = target AND anonymized_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE lead_notes SET body = '[removido a pedido do titular]' WHERE lead_id = target;
  UPDATE lead_tasks SET title = '[removido a pedido do titular]' WHERE lead_id = target;
  UPDATE chat_messages SET body = '[mensagem removida a pedido do titular]' WHERE lead_id = target;
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, data)
  VALUES (actor, 'lgpd.anonymize', 'lead', target::text, jsonb_build_object('reason', reason));
  RETURN true;
END $$;
