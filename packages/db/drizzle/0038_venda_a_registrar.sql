ALTER TABLE "lead_timeline" DROP CONSTRAINT "timeline_kind_allowed";--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "timeline_kind_allowed" CHECK ("lead_timeline"."kind" in ('lead.created','lead.updated','lead.moved','lead.reassigned','lead.deleted','lead.called','lead.contact_rescheduled','note.created','note.updated','task.created','task.updated','meeting.scheduled','meeting.rescheduled','meeting.canceled','meeting.outcome','meeting.confirmed','sale.registered','sale.pending','sale.reversed','payment.received'));--> statement-breakpoint
-- Venda Fechada no cadastro (NPAC-39, 05/11/2026): sem a venda, o lead entra em Venda como
-- "venda a registrar" e o closer da reunião recebe o pedido de registro (`sale.pending`, entity =
-- reunião). Mesma função da 0019 + o tipo novo.
CREATE OR REPLACE FUNCTION notify_from_timeline() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.kind NOT IN ('lead.created','lead.reassigned','note.created','meeting.scheduled',
    'meeting.rescheduled','meeting.canceled','meeting.outcome','sale.registered','sale.pending',
    'sale.reversed','payment.received') THEN
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
-- Lead em Venda sem venda ativa. SECURITY DEFINER: a RLS de deals mostra ao SDR só as vendas
-- dele e ao closer só as que fechou, o que marcaria "a registrar" um lead que já tem venda de
-- outra pessoa. Devolve só sim/não; a API chama apenas para leads que o usuário já enxerga.
CREATE FUNCTION lead_sale_pending(p_lead uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT (SELECT app_user_id()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
      WHERE l.id = p_lead AND s.key = 'VENDA')
    AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = p_lead AND d.reversed_at IS NULL)
$$;
--> statement-breakpoint
ALTER FUNCTION lead_sale_pending(uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lead_sale_pending(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lead_sale_pending(uuid) TO npac_app;
