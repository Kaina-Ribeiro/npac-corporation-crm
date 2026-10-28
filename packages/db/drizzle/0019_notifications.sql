CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"timeline_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_timeline_id_lead_timeline_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "public"."lead_timeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
-- Avisos: quando alguém mexe num lead, o SDR e o closer dele (menos quem fez) recebem um aviso.
-- Gerado no banco para não depender de cada serviço lembrar; guarda só a referência à timeline.
CREATE FUNCTION notify_from_timeline() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.kind NOT IN ('lead.created','lead.reassigned','note.created','meeting.scheduled',
    'meeting.rescheduled','meeting.canceled','meeting.outcome','sale.registered','sale.reversed',
    'payment.received') THEN
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
ALTER FUNCTION notify_from_timeline() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION notify_from_timeline() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER lead_timeline_notify AFTER INSERT ON lead_timeline
  FOR EACH ROW EXECUTE FUNCTION notify_from_timeline();
--> statement-breakpoint
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_own ON notifications FOR SELECT USING (user_id = (SELECT app_user_id()));
CREATE POLICY notifications_read ON notifications FOR UPDATE
  USING (user_id = (SELECT app_user_id())) WITH CHECK (user_id = (SELECT app_user_id()));
GRANT SELECT, UPDATE (read_at) ON notifications TO npac_app;
