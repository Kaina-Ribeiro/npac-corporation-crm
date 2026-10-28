CREATE TABLE "lgpd_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"lead_id" uuid,
	"description" text NOT NULL,
	"resolution" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() + interval '15 days' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "lgpd_kind" CHECK ("lgpd_requests"."kind" in ('ACCESS','CORRECTION','DELETION')),
	CONSTRAINT "lgpd_status" CHECK ("lgpd_requests"."status" in ('OPEN','DONE','REJECTED')),
	CONSTRAINT "lgpd_resolution_pair" CHECK (("lgpd_requests"."status" = 'OPEN') = ("lgpd_requests"."resolved_at" is null) and ("lgpd_requests"."resolved_at" is null) = ("lgpd_requests"."resolved_by" is null)),
	CONSTRAINT "lgpd_lengths" CHECK (char_length("lgpd_requests"."description") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lgpd_requests" ADD CONSTRAINT "lgpd_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lgpd_requests" ADD CONSTRAINT "lgpd_requests_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lgpd_requests" ADD CONSTRAINT "lgpd_requests_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lgpd_status_idx" ON "lgpd_requests" USING btree ("status","due_at");--> statement-breakpoint
-- Admin: HEAD convida usuários (Better Auth cria user/account como npac_app) e mantém o catálogo.
GRANT INSERT ON "user", account TO npac_app;
--> statement-breakpoint
CREATE POLICY products_insert ON products FOR INSERT WITH CHECK ((SELECT app_role()) = 'HEAD');
CREATE POLICY products_update ON products FOR UPDATE USING ((SELECT app_role()) = 'HEAD');
GRANT INSERT, UPDATE ON products TO npac_app;
--> statement-breakpoint
-- Auditoria: qualquer processo registra; só HEAD lê. Continua sem UPDATE/DELETE.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY audit_select ON audit_log FOR SELECT USING ((SELECT app_role()) = 'HEAD');
--> statement-breakpoint
ALTER TABLE lgpd_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lgpd_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY lgpd_head ON lgpd_requests FOR ALL
  USING ((SELECT app_role()) = 'HEAD') WITH CHECK ((SELECT app_role()) = 'HEAD');
GRANT SELECT, INSERT, UPDATE ON lgpd_requests TO npac_app;
--> statement-breakpoint
-- Anonimização: remove contato e textos livres do titular; mantém fatos financeiros sem PII.
CREATE FUNCTION lgpd_anonymize(target uuid, actor text, reason text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE active_sale boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = target AND d.reversed_at IS NULL) INTO active_sale;
  UPDATE leads SET name = 'Titular anonimizado', phone_enc = NULL, phone_bidx = NULL, instagram = NULL,
    summary = NULL, next_contact_at = NULL, anonymized_at = now(), updated_at = now(), version = version + 1,
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
--> statement-breakpoint
CREATE FUNCTION lgpd_anonymize_lead(target uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF app_role() IS DISTINCT FROM 'HEAD' THEN
    RAISE EXCEPTION 'apenas HEAD' USING ERRCODE = '42501';
  END IF;
  RETURN lgpd_anonymize(target, app_user_id(), 'request');
END $$;
--> statement-breakpoint
-- Worker diário (roda como owner): anonimiza excluídos há mais de N dias ou com retenção vencida.
CREATE FUNCTION lgpd_retention(deleted_days integer DEFAULT 180) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE n integer := 0; l record;
BEGIN
  FOR l IN SELECT id FROM leads WHERE anonymized_at IS NULL AND (
      deleted_at < now() - make_interval(days => deleted_days)
      OR (retention_until < current_date
        AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = leads.id AND d.reversed_at IS NULL)))
  LOOP
    IF lgpd_anonymize(l.id, NULL, 'retention') THEN n := n + 1; END IF;
  END LOOP;
  DELETE FROM session WHERE expires_at < now();
  DELETE FROM verification WHERE expires_at < now();
  RETURN n;
END $$;
--> statement-breakpoint
ALTER FUNCTION lgpd_anonymize(uuid, text, text) OWNER TO npac_owner;
ALTER FUNCTION lgpd_anonymize_lead(uuid) OWNER TO npac_owner;
ALTER FUNCTION lgpd_retention(integer) OWNER TO npac_owner;
REVOKE ALL ON FUNCTION lgpd_anonymize(uuid, text, text), lgpd_anonymize_lead(uuid), lgpd_retention(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lgpd_anonymize_lead(uuid) TO npac_app;
