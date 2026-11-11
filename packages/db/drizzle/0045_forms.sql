ALTER TYPE "public"."lead_source" ADD VALUE 'FORMULARIO';--> statement-breakpoint
CREATE TABLE "form_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"answers_enc" "bytea",
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_responses_response_id_unique" UNIQUE("response_id")
);
--> statement-breakpoint
ALTER TABLE "lead_timeline" DROP CONSTRAINT "timeline_kind_allowed";--> statement-breakpoint
ALTER TABLE "form_responses" ADD CONSTRAINT "form_responses_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_responses_lead_idx" ON "form_responses" USING btree ("lead_id");--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "timeline_kind_allowed" CHECK ("lead_timeline"."kind" in ('lead.created','lead.updated','lead.moved','lead.reassigned','lead.deleted','lead.called','lead.contact_rescheduled','note.created','note.updated','task.created','task.updated','meeting.scheduled','meeting.rescheduled','meeting.canceled','meeting.outcome','meeting.confirmed','sale.registered','sale.pending','sale.reversed','payment.pending','payment.received','form.received'));--> statement-breakpoint
-- Respostas do Google Forms (NPAC-42): leitura para quem enxerga o lead; gravação só pela função
-- abaixo, que roda fora da RLS porque o webhook não tem a sessão de quem é dono do lead.
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE form_responses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY form_responses_read ON form_responses FOR SELECT USING (lead_id IN (SELECT id FROM leads));
--> statement-breakpoint
GRANT SELECT ON form_responses TO npac_app;
--> statement-breakpoint
-- Lead de um contato do formulário, entre todos os SDRs. Prioridade: telefone, Instagram, e-mail.
CREATE FUNCTION form_find_lead(pbidx text, insta text, ebidx text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT l.id FROM leads l
  WHERE app_user_id() IS NOT NULL AND l.deleted_at IS NULL AND l.anonymized_at IS NULL
    AND ((pbidx IS NOT NULL AND l.phone_bidx = pbidx)
      OR (insta IS NOT NULL AND l.instagram = insta)
      OR (ebidx IS NOT NULL AND l.email_bidx = ebidx))
  ORDER BY CASE
      WHEN pbidx IS NOT NULL AND l.phone_bidx = pbidx THEN 0
      WHEN insta IS NOT NULL AND l.instagram = insta THEN 1
      ELSE 2
    END, l.created_at, l.id
  LIMIT 1
$$;
--> statement-breakpoint
-- A resposta já foi recebida? Só sim/não, para o reenvio não criar outro lead.
CREATE FUNCTION form_response_seen(p_response text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT app_user_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM form_responses r WHERE r.response_id = p_response)
$$;
--> statement-breakpoint
-- Grava a resposta, a timeline e a auditoria na mesma transação. O autor é o dono do lead.
-- Devolve o dono do lead, ou NULL se a resposta já existia.
CREATE FUNCTION form_response_record(p_response text, p_lead uuid, p_answers bytea, p_submitted timestamptz)
  RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE new_id uuid; lead_owner text;
BEGIN
  IF app_user_id() IS NULL THEN
    RAISE EXCEPTION 'usuário não definido' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT l.sdr_id INTO lead_owner FROM leads l WHERE l.id = p_lead AND l.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO form_responses (response_id, lead_id, answers_enc, submitted_at)
  VALUES (p_response, p_lead, p_answers, p_submitted)
  ON CONFLICT (response_id) DO NOTHING
  RETURNING id INTO new_id;
  IF new_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO lead_timeline (lead_id, actor_id, kind, entity_id)
  VALUES (p_lead, lead_owner, 'form.received', new_id);
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, data)
  VALUES (lead_owner, 'form.received', 'lead', p_lead::text, jsonb_build_object('entityId', new_id));
  RETURN lead_owner;
END $$;
--> statement-breakpoint
ALTER FUNCTION form_find_lead(text, text, text) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION form_response_seen(text) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION form_response_record(text, uuid, bytea, timestamptz) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION form_find_lead(text, text, text), form_response_seen(text), form_response_record(text, uuid, bytea, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION form_find_lead(text, text, text), form_response_seen(text), form_response_record(text, uuid, bytea, timestamptz) TO npac_app;
--> statement-breakpoint
-- Formulário novo: avisa o dono e a liderança, sem excluir o autor, porque o autor registrado é o
-- próprio dono. Demais tipos: mesma função da 0043.
CREATE OR REPLACE FUNCTION notify_from_timeline() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.kind = 'form.received' THEN
    INSERT INTO notifications (user_id, timeline_id)
    SELECT DISTINCT r.uid, NEW.id FROM (
      SELECT l.sdr_id AS uid FROM leads l WHERE l.id = NEW.lead_id
      UNION SELECT x.id FROM "user" x WHERE x.role IN ('DIRETOR','HEAD')
    ) r JOIN "user" u ON u.id = r.uid AND u.active;
    RETURN NEW;
  END IF;
  IF NEW.kind NOT IN ('lead.created','lead.reassigned','note.created','meeting.scheduled',
    'meeting.rescheduled','meeting.canceled','meeting.outcome','sale.registered','sale.pending',
    'sale.reversed','payment.pending','payment.received') THEN
    RETURN NEW;
  END IF;
  INSERT INTO notifications (user_id, timeline_id)
  SELECT DISTINCT r.uid, NEW.id FROM (
    SELECT l.sdr_id AS uid FROM leads l WHERE l.id = NEW.lead_id
    UNION SELECT l.closer_id FROM leads l WHERE l.id = NEW.lead_id
    UNION SELECT m.closer_id FROM meetings m WHERE m.id = NEW.entity_id
    UNION SELECT d.closer_id FROM deals d WHERE d.id = NEW.entity_id
  ) r JOIN "user" u ON u.id = r.uid AND u.active
  WHERE r.uid IS NOT NULL AND r.uid <> NEW.actor_id;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- LGPD: as respostas do formulário são dados do titular (mesma função da 0044 + form_responses).
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
  UPDATE form_responses SET answers_enc = NULL WHERE lead_id = target;
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, data)
  VALUES (actor, 'lgpd.anonymize', 'lead', target::text, jsonb_build_object('reason', reason));
  RETURN true;
END $$;