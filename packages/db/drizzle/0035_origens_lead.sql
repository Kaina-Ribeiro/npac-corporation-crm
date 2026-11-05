ALTER TYPE "public"."lead_source" ADD VALUE 'AUDIO_AUTOMACAO' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'AUTOMACAO_COMENTARIOS' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'LEVANTADA_MAO_STORY' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'CALCULADORA' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'BIO' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'NACAO' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'EMAIL' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'YOUTUBE' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'CLUBE' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'SALA_SECRETA' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'FOLLOW' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'ATIVACAO_STORIES' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'ATIVACAO_COMENTARIOS' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'DIRECT_INTERESSE' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'DIRECT_FECHAR' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'INDICACAO_DESAFIO_NACAO' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'LISTA_DIAGNOSTICO_FINANCEIRO' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'TIKTOK' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'EVENTO' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'LEVANTADA_MAO_AULA' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'MAGIA_FIM_DE_MES' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'PDF_6' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'PDF_10' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'FOLLOW_AULA' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'SUPORTE' BEFORE 'INDICACAO';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_other" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_other_check" CHECK ("leads"."source_other" is null or ("leads"."source" = 'OUTRO' and char_length("leads"."source_other") between 1 and 80));
--> statement-breakpoint
-- LGPD: o texto de "Outro" também é texto livre do titular (mesma função da 0016 + source_other).
CREATE OR REPLACE FUNCTION lgpd_anonymize(target uuid, actor text, reason text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE active_sale boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = target AND d.reversed_at IS NULL) INTO active_sale;
  UPDATE leads SET name = 'Titular anonimizado', phone_enc = NULL, phone_bidx = NULL, instagram = NULL,
    summary = NULL, source_other = NULL, next_contact_at = NULL, anonymized_at = now(), updated_at = now(),
    version = version + 1,
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