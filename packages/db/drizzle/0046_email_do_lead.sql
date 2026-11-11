ALTER TABLE "lead_timeline" DROP CONSTRAINT "timeline_fields_allowed";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_enc" "bytea";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_bidx" text;--> statement-breakpoint
CREATE INDEX "leads_email_bidx_idx" ON "leads" USING btree ("email_bidx");--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "timeline_fields_allowed" CHECK ("lead_timeline"."fields" <@ ARRAY['name','phone','instagram','email','incomeBand','source','tier','stageKey','sdrId','closerId','nextContactAt','summary','body','title','dueAt','completedAt','assigneeId','scheduledAt','origin','outcome','canceledAt','step','payment','lostReason']::text[]);--> statement-breakpoint
-- Duplicidade por e-mail (NPAC-42): troca as duas assinaturas da 0003 e da 0007. O e-mail vem por
-- último e com DEFAULT porque, durante o deploy, a API antiga ainda chama as formas sem ele. O
-- parâmetro não se chama email_bidx: dentro de SELECT ... FROM leads, a coluna ganharia do parâmetro.
DROP FUNCTION lead_contact_taken(text, text);
--> statement-breakpoint
DROP FUNCTION lead_contact_taken(text, text, uuid);
--> statement-breakpoint
CREATE FUNCTION lead_contact_taken(bidx text, insta text, ebidx text DEFAULT NULL) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT app_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM leads l
    WHERE l.deleted_at IS NULL
      AND ((bidx IS NOT NULL AND l.phone_bidx = bidx)
        OR (insta IS NOT NULL AND l.instagram = insta)
        OR (ebidx IS NOT NULL AND l.email_bidx = ebidx))
  )
$$;
--> statement-breakpoint
CREATE FUNCTION lead_contact_taken(bidx text, insta text, exclude_id uuid, ebidx text DEFAULT NULL) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT app_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM leads l
    WHERE l.deleted_at IS NULL AND l.id <> exclude_id
      AND ((bidx IS NOT NULL AND l.phone_bidx = bidx)
        OR (insta IS NOT NULL AND l.instagram = insta)
        OR (ebidx IS NOT NULL AND l.email_bidx = ebidx))
  )
$$;
--> statement-breakpoint
ALTER FUNCTION lead_contact_taken(text, text, text) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION lead_contact_taken(text, text, uuid, text) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lead_contact_taken(text, text, text), lead_contact_taken(text, text, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lead_contact_taken(text, text, text), lead_contact_taken(text, text, uuid, text) TO npac_app;
--> statement-breakpoint
-- LGPD: o e-mail é contato pessoal (mesma função da 0037 + email_enc e email_bidx).
CREATE OR REPLACE FUNCTION lgpd_anonymize(target uuid, actor text, reason text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE active_sale boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = target AND d.reversed_at IS NULL) INTO active_sale;
  UPDATE leads SET name = 'Titular anonimizado', phone_enc = NULL, phone_bidx = NULL, instagram = NULL,
    email_enc = NULL, email_bidx = NULL,
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
