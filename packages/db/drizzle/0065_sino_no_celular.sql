CREATE TABLE "notification_pushes" (
	"notification_id" uuid PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Todo aviso do sino também vira push (NPAC-48, pedido do Igor, 17/11/2026), para as mesmas
-- pessoas. Sem polling: o INSERT em notifications avisa a API por NOTIFY (entregue só no commit)
-- e ela reivindica o aviso aqui. Esta tabela fica fora do app_revision (gravar nela não acorda as
-- telas) e só as funções abaixo mexem nela.
ALTER TABLE notification_pushes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_pushes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION notification_push_notify() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_notify('npac_aviso', NEW.id::text);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER notifications_push AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notification_push_notify();
--> statement-breakpoint
-- Marca como enviados e devolve os avisos ainda sem push: os de p_ids (o NOTIFY) ou, com p_ids
-- nulo, todos os dos últimos 10 min (a API subindo ou reconectando). Lido antes não vai; o do
-- formulário já tem push próprio (forms.service.ts). Com mais de uma instância, o ON CONFLICT
-- garante um push por aviso. O nome do lead não sai daqui: a API lê como a pessoa (RLS).
CREATE FUNCTION notification_push_claim(p_ids uuid[])
RETURNS TABLE (notification_id uuid, user_id text, kind text, actor_name text, lead_id uuid,
  timeline_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM notification_pushes WHERE sent_at < now() - interval '1 day';
  RETURN QUERY
  WITH ins AS (
    INSERT INTO notification_pushes (notification_id)
    SELECT n.id FROM notifications n JOIN lead_timeline t ON t.id = n.timeline_id
    WHERE (p_ids IS NULL OR n.id = ANY (p_ids))
      AND n.created_at > now() - interval '10 minutes'
      AND n.read_at IS NULL AND t.kind <> 'form.received'
    ON CONFLICT DO NOTHING
    RETURNING notification_pushes.notification_id
  )
  SELECT n.id, n.user_id, t.kind, a.name, t.lead_id, t.id
  FROM ins i JOIN notifications n ON n.id = i.notification_id
  JOIN lead_timeline t ON t.id = n.timeline_id
  JOIN "user" a ON a.id = t.actor_id
  JOIN "user" u ON u.id = n.user_id AND u.active
  ORDER BY n.created_at, n.id;
END $$;
--> statement-breakpoint
-- Lembrete de reunião também para o closer da reunião (NPAC-48, B3): devolve o closer ao lado do
-- dono do lead; cada um vem nulo se estiver desativado. Mesma regra da 0028 no resto.
DROP FUNCTION meeting_reminder_claim(timestamptz);
--> statement-breakpoint
CREATE FUNCTION meeting_reminder_claim(p_now timestamptz)
RETURNS TABLE (meeting_id uuid, step text, scheduled_at timestamptz, sdr_id text, closer_id text,
  lead_name text)
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
  SELECT x.meeting_id, x.step, x.scheduled_at, s.id, c.id, l.name
  FROM latest x JOIN meetings m ON m.id = x.meeting_id JOIN leads l ON l.id = m.lead_id
  LEFT JOIN "user" s ON s.id = l.sdr_id AND s.active
  LEFT JOIN "user" c ON c.id = m.closer_id AND c.active
  WHERE s.id IS NOT NULL OR c.id IS NOT NULL;
END $$;
--> statement-breakpoint
ALTER FUNCTION notification_push_notify() OWNER TO npac_owner;
ALTER FUNCTION notification_push_claim(uuid[]) OWNER TO npac_owner;
ALTER FUNCTION meeting_reminder_claim(timestamptz) OWNER TO npac_owner;
REVOKE ALL ON FUNCTION notification_push_notify(), notification_push_claim(uuid[]),
  meeting_reminder_claim(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notification_push_claim(uuid[]), meeting_reminder_claim(timestamptz)
  TO npac_app;
