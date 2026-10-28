CREATE TABLE "chat_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"dm_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_channels_dm_key_unique" UNIQUE("dm_key"),
	CONSTRAINT "chat_channel_kind" CHECK ("chat_channels"."kind" in ('GENERAL','DM') and ("chat_channels"."kind" = 'DM') = ("chat_channels"."dm_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "chat_members" (
	"channel_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "chat_members_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_body_length" CHECK (char_length("chat_messages"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "chat_reads" (
	"channel_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_id" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_reads_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "playbook_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playbook_topic_title" UNIQUE("topic","title"),
	CONSTRAINT "playbook_lengths" CHECK (char_length("playbook_scripts"."title") between 1 and 200 and char_length("playbook_scripts"."body") between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_scripts" ADD CONSTRAINT "playbook_scripts_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_one_general" ON "chat_channels" USING btree ("kind") WHERE "chat_channels"."kind" = 'GENERAL';--> statement-breakpoint
CREATE INDEX "chat_members_user_idx" ON "chat_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_channel_idx" ON "chat_messages" USING btree ("channel_id","id");--> statement-breakpoint
-- Chat: Geral visível a todo usuário ativo; DM só aos dois membros (HEAD inclusive).
CREATE FUNCTION chat_can_read(ch uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT app_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM chat_channels c WHERE c.id = ch AND (c.kind = 'GENERAL'
      OR EXISTS (SELECT 1 FROM chat_members m WHERE m.channel_id = ch AND m.user_id = app_user_id())))
$$;
--> statement-breakpoint
-- Abre (ou reaproveita) a DM do usuário corrente com outro usuário ativo.
CREATE FUNCTION chat_open_dm(other text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE me text := app_user_id(); k text; ch uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'sem usuário' USING ERRCODE = '42501'; END IF;
  IF other = me OR NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = other AND u.active) THEN
    RAISE EXCEPTION 'destinatário inválido' USING ERRCODE = '22023';
  END IF;
  k := least(me, other) || '|' || greatest(me, other);
  INSERT INTO chat_channels (kind, dm_key) VALUES ('DM', k) ON CONFLICT (dm_key) DO NOTHING;
  SELECT id INTO ch FROM chat_channels WHERE dm_key = k;
  INSERT INTO chat_members (channel_id, user_id) VALUES (ch, me), (ch, other) ON CONFLICT DO NOTHING;
  RETURN ch;
END $$;
--> statement-breakpoint
ALTER FUNCTION chat_can_read(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION chat_open_dm(text) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION chat_can_read(uuid), chat_open_dm(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION chat_can_read(uuid), chat_open_dm(text) TO npac_app;
--> statement-breakpoint
INSERT INTO chat_channels (kind) VALUES ('GENERAL') ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channels FORCE ROW LEVEL SECURITY;
CREATE POLICY chat_channels_read ON chat_channels FOR SELECT USING (chat_can_read(id));
GRANT SELECT ON chat_channels TO npac_app;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members FORCE ROW LEVEL SECURITY;
CREATE POLICY chat_members_read ON chat_members FOR SELECT USING (chat_can_read(channel_id));
GRANT SELECT ON chat_members TO npac_app;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY chat_messages_read ON chat_messages FOR SELECT USING (chat_can_read(channel_id));
CREATE POLICY chat_messages_insert ON chat_messages FOR INSERT WITH CHECK (
  author_id = (SELECT app_user_id()) AND chat_can_read(channel_id)
  AND (lead_id IS NULL OR lead_id IN (SELECT id FROM leads WHERE deleted_at IS NULL))
);
GRANT SELECT, INSERT ON chat_messages TO npac_app;
GRANT USAGE ON SEQUENCE chat_messages_id_seq TO npac_app;
ALTER TABLE chat_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY chat_reads_own ON chat_reads FOR ALL
  USING (user_id = (SELECT app_user_id()) AND chat_can_read(channel_id))
  WITH CHECK (user_id = (SELECT app_user_id()) AND chat_can_read(channel_id));
GRANT SELECT, INSERT, UPDATE ON chat_reads TO npac_app;
--> statement-breakpoint
-- Playbook: leitura para todos os usuários ativos, edição só HEAD.
ALTER TABLE playbook_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_scripts FORCE ROW LEVEL SECURITY;
CREATE POLICY playbook_read ON playbook_scripts FOR SELECT USING ((SELECT app_user_id()) IS NOT NULL);
CREATE POLICY playbook_insert ON playbook_scripts FOR INSERT WITH CHECK (
  (SELECT app_role()) = 'HEAD' AND updated_by = (SELECT app_user_id()));
CREATE POLICY playbook_update ON playbook_scripts FOR UPDATE USING ((SELECT app_role()) = 'HEAD')
  WITH CHECK (updated_by = (SELECT app_user_id()));
CREATE POLICY playbook_delete ON playbook_scripts FOR DELETE USING ((SELECT app_role()) = 'HEAD');
GRANT SELECT, INSERT, UPDATE, DELETE ON playbook_scripts TO npac_app;
