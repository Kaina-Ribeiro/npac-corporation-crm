ALTER TABLE "leads" DROP CONSTRAINT "leads_payment_check";--> statement-breakpoint
ALTER TABLE "lead_timeline" DROP CONSTRAINT "timeline_kind_allowed";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "payment_entry_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_payment_check" CHECK ("leads"."payment_amount_cents" is null or ("leads"."payment_product_id" is not null and "leads"."payment_amount_cents" > 0));--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "timeline_kind_allowed" CHECK ("lead_timeline"."kind" in ('lead.created','lead.updated','lead.moved','lead.reassigned','lead.deleted','lead.called','lead.contact_rescheduled','note.created','note.updated','task.created','task.updated','meeting.scheduled','meeting.rescheduled','meeting.canceled','meeting.outcome','meeting.confirmed','sale.registered','sale.pending','sale.reversed','payment.pending','payment.received'));--> statement-breakpoint
-- Parciais já gravados: a marca acompanha a entrada (item 13 do Igor, 10/11/2026).
UPDATE leads SET payment_entry_paid = true WHERE payment_entry_cents IS NOT NULL;
--> statement-breakpoint
-- O closer escolhido pelo SDR (`leads.closer_id`) enxerga o lead em Agendou Pagamento mesmo sem
-- reunião. Depois de registrar a venda (o lead sai da etapa), continua vendo pela venda ativa dele:
-- sem isso a timeline da própria venda e o recebimento das parcelas perderiam o lead.
CREATE OR REPLACE FUNCTION closer_has_lead(lead uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.lead_id = lead AND m.closer_id = app_user_id() AND m.canceled_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
    WHERE l.id = lead AND l.closer_id = app_user_id() AND (
      s.key = 'AGENDOU_PAGAMENTO'
      OR EXISTS (SELECT 1 FROM deals d
        WHERE d.lead_id = l.id AND d.closer_id = l.closer_id AND d.reversed_at IS NULL)
    )
  )
$$;
--> statement-breakpoint
-- O SDR passa a escolher o closer só com o pagamento a completar (Agendou Pagamento sem valor) e
-- só um usuário ativo que fecha venda. O resto continua só com a liderança, como na 0003.
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
-- O closer do lead completa valor, entrada e data sem trocar a etapa, só enquanto não há valor.
CREATE OR REPLACE FUNCTION leads_guard_closer_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE allowed text[] := ARRAY['stage_id','version','updated_at'];
BEGIN
  IF current_user = 'npac_app' AND app_role() = 'CLOSER' THEN
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      allowed := allowed || ARRAY['payment_product_id','payment_amount_cents','payment_entry_cents',
        'payment_entry_paid','lost_reason','lost_reason_other','next_contact_at','sold_product_id'];
    ELSE
      IF NEW.sold_product_id IS NULL THEN
        allowed := allowed || ARRAY['sold_product_id'];
      END IF;
      IF OLD.payment_amount_cents IS NULL AND OLD.closer_id = app_user_id() AND EXISTS (
        SELECT 1 FROM pipeline_stages s WHERE s.id = OLD.stage_id AND s.key = 'AGENDOU_PAGAMENTO'
      ) THEN
        allowed := allowed || ARRAY['payment_amount_cents','payment_entry_cents',
          'payment_entry_paid','next_contact_at'];
      END IF;
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
      RAISE EXCEPTION 'closer só pode mover a etapa do lead' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- Pagamento a completar: o closer do lead recebe o aviso. Mesma função da 0038 + o tipo novo.
CREATE OR REPLACE FUNCTION notify_from_timeline() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
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
