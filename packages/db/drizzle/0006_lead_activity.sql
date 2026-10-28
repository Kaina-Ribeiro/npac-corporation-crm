CREATE TABLE "lead_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"title" text NOT NULL,
	"assignee_id" text NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"entity_id" uuid,
	"fields" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_kind_allowed" CHECK ("lead_timeline"."kind" in ('lead.created','lead.updated','lead.moved','lead.reassigned','lead.deleted','note.created','note.updated','task.created','task.updated','meeting.scheduled','meeting.rescheduled','meeting.canceled','meeting.outcome')),
	CONSTRAINT "timeline_fields_allowed" CHECK ("lead_timeline"."fields" <@ ARRAY['name','phone','instagram','incomeBand','source','tier','stageKey','sdrId','closerId','nextContactAt','summary','body','title','dueAt','completedAt','assigneeId','scheduledAt','origin','outcome','canceledAt']::text[])
);
--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "lead_timeline_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "lead_timeline_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_notes_lead_idx" ON "lead_notes" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_tasks_lead_idx" ON "lead_tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_tasks_due_idx" ON "lead_tasks" USING btree ("assignee_id","due_at");--> statement-breakpoint
CREATE INDEX "lead_timeline_lead_idx" ON "lead_timeline" USING btree ("lead_id","at");--> statement-breakpoint
-- Todas as atividades herdam a visibilidade atual do lead.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['lead_notes','lead_tasks','lead_timeline'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO npac_app', tbl);
    EXECUTE format('CREATE POLICY activity_select ON %I FOR SELECT USING (lead_id IN (SELECT id FROM leads))', tbl);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE POLICY notes_insert ON lead_notes FOR INSERT WITH CHECK
  (created_by = (SELECT app_user_id()) AND lead_id IN (SELECT id FROM leads));
--> statement-breakpoint
CREATE POLICY tasks_insert ON lead_tasks FOR INSERT WITH CHECK
  (created_by = (SELECT app_user_id()) AND lead_id IN (SELECT id FROM leads));
--> statement-breakpoint
CREATE POLICY timeline_insert ON lead_timeline FOR INSERT WITH CHECK
  (actor_id = (SELECT app_user_id()) AND lead_id IN (SELECT id FROM leads));
--> statement-breakpoint
GRANT UPDATE ON lead_notes, lead_tasks TO npac_app;
--> statement-breakpoint
CREATE POLICY notes_update ON lead_notes FOR UPDATE
  USING (lead_id IN (SELECT id FROM leads) AND (created_by = (SELECT app_user_id()) OR (SELECT app_role()) = 'HEAD'))
  WITH CHECK (lead_id IN (SELECT id FROM leads));
--> statement-breakpoint
CREATE POLICY tasks_update ON lead_tasks FOR UPDATE
  USING (lead_id IN (SELECT id FROM leads)) WITH CHECK (lead_id IN (SELECT id FROM leads));
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON lead_timeline FROM npac_app;
--> statement-breakpoint
CREATE FUNCTION activity_guard_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'identidade da atividade é imutável' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER notes_guard_identity BEFORE UPDATE ON lead_notes
  FOR EACH ROW EXECUTE FUNCTION activity_guard_identity();
--> statement-breakpoint
CREATE TRIGGER tasks_guard_identity BEFORE UPDATE ON lead_tasks
  FOR EACH ROW EXECUTE FUNCTION activity_guard_identity();
