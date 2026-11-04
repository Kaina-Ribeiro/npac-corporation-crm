CREATE TABLE "meeting_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"step" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_confirmations_once" UNIQUE("meeting_id","step","scheduled_at"),
	CONSTRAINT "meeting_confirmations_step" CHECK ("meeting_confirmations"."step" in ('H1','M15'))
);
--> statement-breakpoint
CREATE TABLE "meeting_reminders_sent" (
	"meeting_id" uuid NOT NULL,
	"step" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_reminders_sent_meeting_id_step_scheduled_at_pk" PRIMARY KEY("meeting_id","step","scheduled_at"),
	CONSTRAINT "meeting_reminders_step" CHECK ("meeting_reminders_sent"."step" in ('H1','M15','M1'))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" "bytea" NOT NULL,
	"auth" "bytea" NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "lead_timeline" DROP CONSTRAINT "timeline_kind_allowed";--> statement-breakpoint
ALTER TABLE "lead_timeline" DROP CONSTRAINT "timeline_fields_allowed";--> statement-breakpoint
ALTER TABLE "meeting_confirmations" ADD CONSTRAINT "meeting_confirmations_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_confirmations" ADD CONSTRAINT "meeting_confirmations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reminders_sent" ADD CONSTRAINT "meeting_reminders_sent_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "timeline_kind_allowed" CHECK ("lead_timeline"."kind" in ('lead.created','lead.updated','lead.moved','lead.reassigned','lead.deleted','lead.called','lead.contact_rescheduled','note.created','note.updated','task.created','task.updated','meeting.scheduled','meeting.rescheduled','meeting.canceled','meeting.outcome','meeting.confirmed','sale.registered','sale.reversed','payment.received'));--> statement-breakpoint
ALTER TABLE "lead_timeline" ADD CONSTRAINT "timeline_fields_allowed" CHECK ("lead_timeline"."fields" <@ ARRAY['name','phone','instagram','incomeBand','source','tier','stageKey','sdrId','closerId','nextContactAt','summary','body','title','dueAt','completedAt','assigneeId','scheduledAt','origin','outcome','canceledAt','step']::text[]);--> statement-breakpoint
-- Avisos do chat e lembretes de reunião (NPAC-26, 04/11/2026).
-- Inscrições de push: cada pessoa vê e apaga só as suas. A gravação passa por push_subscribe,
-- que tira o mesmo aparelho (endpoint) de quem estava logado antes nele.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_own ON push_subscriptions FOR SELECT
  USING (user_id = (SELECT app_user_id()));
CREATE POLICY push_subscriptions_delete ON push_subscriptions FOR DELETE
  USING (user_id = (SELECT app_user_id()));
GRANT SELECT, DELETE ON push_subscriptions TO npac_app;
--> statement-breakpoint
CREATE FUNCTION push_subscribe(p_endpoint text, p_p256dh bytea, p_auth bytea, p_ua text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid text := app_user_id();
BEGIN
  IF uid IS NULL OR app_role() IS NULL THEN RAISE EXCEPTION 'sem usuário'; END IF;
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (uid, p_endpoint, p_p256dh, p_auth, p_ua);
END $$;
--> statement-breakpoint
-- Desativar usuário apaga as inscrições dele (só a liderança desativa).
CREATE FUNCTION push_purge_user(target text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF app_role() IS DISTINCT FROM 'HEAD' THEN RAISE EXCEPTION 'sem permissão'; END IF;
  DELETE FROM push_subscriptions WHERE user_id = target;
END $$;
--> statement-breakpoint
-- Confirmações: visíveis a quem vê a reunião; só o dono do lead grava, para o horário atual.
ALTER TABLE meeting_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY meeting_confirmations_select ON meeting_confirmations FOR SELECT
  USING (EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_id));
CREATE POLICY meeting_confirmations_insert ON meeting_confirmations FOR INSERT
  WITH CHECK (user_id = (SELECT app_user_id()) AND EXISTS (
    SELECT 1 FROM meetings m JOIN leads l ON l.id = m.lead_id
    WHERE m.id = meeting_id AND m.scheduled_at = meeting_confirmations.scheduled_at
      AND m.canceled_at IS NULL AND m.outcome IS NULL AND l.sdr_id = (SELECT app_user_id())));
GRANT SELECT, INSERT ON meeting_confirmations TO npac_app;
--> statement-breakpoint
-- Lembretes enviados: só pelas funções abaixo (o despertador roda sem usuário).
ALTER TABLE meeting_reminders_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_reminders_sent FORCE ROW LEVEL SECURITY;
CREATE INDEX meetings_open_scheduled_idx ON meetings (scheduled_at)
  WHERE canceled_at IS NULL AND outcome IS NULL;
--> statement-breakpoint
-- Etapas pendentes: reuniões futuras, não canceladas e sem resultado, de lead ativo.
CREATE FUNCTION meeting_reminders_pending(p_now timestamptz)
RETURNS TABLE (meeting_id uuid, step text, minutes integer, scheduled_at timestamptz, due_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.id, s.step, s.minutes, m.scheduled_at, m.scheduled_at - make_interval(mins => s.minutes)
  FROM meetings m
  JOIN leads l ON l.id = m.lead_id AND l.deleted_at IS NULL AND l.anonymized_at IS NULL
  CROSS JOIN (VALUES ('H1', 60), ('M15', 15), ('M1', 1)) AS s(step, minutes)
  WHERE m.canceled_at IS NULL AND m.outcome IS NULL AND m.scheduled_at > p_now
    AND NOT EXISTS (SELECT 1 FROM meeting_reminders_sent r
      WHERE r.meeting_id = m.id AND r.step = s.step AND r.scheduled_at = m.scheduled_at)
$$;
--> statement-breakpoint
CREATE FUNCTION meeting_reminder_next(p_now timestamptz) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT min(due_at) FROM meeting_reminders_pending(p_now)
$$;
--> statement-breakpoint
-- Marca como enviadas as etapas vencidas e devolve, por reunião, só a mais recente (quem
-- ficou parado não recebe três avisos de uma vez). Com mais de uma instância, o advisory lock
-- e o ON CONFLICT garantem que cada etapa sai uma vez só.
CREATE FUNCTION meeting_reminder_claim(p_now timestamptz)
RETURNS TABLE (meeting_id uuid, step text, scheduled_at timestamptz, sdr_id text, lead_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('npac:meeting_reminders')) THEN RETURN; END IF;
  RETURN QUERY
  WITH due AS (
    SELECT p.* FROM meeting_reminders_pending(p_now) p WHERE p.due_at <= p_now
  ), ins AS (
    INSERT INTO meeting_reminders_sent (meeting_id, step, scheduled_at)
    SELECT d.meeting_id, d.step, d.scheduled_at FROM due d
    ON CONFLICT DO NOTHING
    RETURNING meeting_reminders_sent.meeting_id, meeting_reminders_sent.step,
      meeting_reminders_sent.scheduled_at
  ), latest AS (
    SELECT DISTINCT ON (i.meeting_id) i.meeting_id, i.step, i.scheduled_at
    FROM ins i JOIN due d ON d.meeting_id = i.meeting_id AND d.step = i.step
    ORDER BY i.meeting_id, d.minutes
  )
  SELECT x.meeting_id, x.step, x.scheduled_at, u.id, l.name
  FROM latest x JOIN meetings m ON m.id = x.meeting_id JOIN leads l ON l.id = m.lead_id
  JOIN "user" u ON u.id = l.sdr_id AND u.active;
END $$;
--> statement-breakpoint
ALTER FUNCTION push_subscribe(text, bytea, bytea, text) OWNER TO npac_owner;
ALTER FUNCTION push_purge_user(text) OWNER TO npac_owner;
ALTER FUNCTION meeting_reminders_pending(timestamptz) OWNER TO npac_owner;
ALTER FUNCTION meeting_reminder_next(timestamptz) OWNER TO npac_owner;
ALTER FUNCTION meeting_reminder_claim(timestamptz) OWNER TO npac_owner;
REVOKE ALL ON FUNCTION push_subscribe(text, bytea, bytea, text), push_purge_user(text),
  meeting_reminders_pending(timestamptz), meeting_reminder_next(timestamptz),
  meeting_reminder_claim(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION push_subscribe(text, bytea, bytea, text), push_purge_user(text),
  meeting_reminder_next(timestamptz), meeting_reminder_claim(timestamptz) TO npac_app;
