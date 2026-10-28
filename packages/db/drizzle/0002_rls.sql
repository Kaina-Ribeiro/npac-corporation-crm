-- Row-Level Security das tabelas de domínio e grants da role de runtime (npac_app).
--
-- As funções SECURITY DEFINER rodam como o dono (npac_owner) e precisam ignorar RLS
-- (superuser ou BYPASSRLS): é isso que permite a closer_has_lead consultar meetings sem
-- reentrar nas políticas (leads -> meetings -> leads) e a lead_contact_taken enxergar
-- leads de todos os SDRs. Sem isso as políticas recursariam, então falhamos cedo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'a role de migração (%) precisa ser superuser ou BYPASSRLS', current_user;
  END IF;
END
$$;
--> statement-breakpoint

-- Usuário corrente: app.user_id só vale se não for vazio e o usuário existir ativo.
CREATE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT u.id FROM "user" u
  WHERE u.id = nullif(current_setting('app.user_id', true), '') AND u.active
$$;
--> statement-breakpoint
CREATE FUNCTION app_role() RETURNS role
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT u.role FROM "user" u WHERE u.id = app_user_id() AND u.active
$$;
--> statement-breakpoint
-- O closer corrente tem reunião não cancelada com o lead? Quebra a recursão leads<->meetings.
CREATE FUNCTION closer_has_lead(lead uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.lead_id = lead AND m.closer_id = app_user_id() AND m.canceled_at IS NULL
  )
$$;
--> statement-breakpoint
-- Deduplicação de contato entre todos os SDRs (ignora leads excluídos).
CREATE FUNCTION lead_contact_taken(bidx text, insta text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads l
    WHERE l.deleted_at IS NULL
      AND ((bidx IS NOT NULL AND l.phone_bidx = bidx) OR (insta IS NOT NULL AND l.instagram = insta))
  )
$$;
--> statement-breakpoint
ALTER FUNCTION app_user_id() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION app_role() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION closer_has_lead(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION lead_contact_taken(text, text) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_user_id(), app_role(), closer_has_lead(uuid), lead_contact_taken(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id(), app_role(), closer_has_lead(uuid), lead_contact_taken(text, text) TO npac_app;
--> statement-breakpoint

-- Grants: domínio
GRANT SELECT, INSERT, UPDATE ON pipeline_stages, leads, meetings TO npac_app;
--> statement-breakpoint
-- audit_log é só-inserção (sem RLS)
GRANT SELECT, INSERT ON audit_log TO npac_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM npac_app;
--> statement-breakpoint
-- Better Auth roda como npac_app (sem RLS nessas tabelas)
GRANT SELECT, INSERT, UPDATE, DELETE ON session, verification, two_factor, rate_limit TO npac_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON "user", account TO npac_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO npac_app;
--> statement-breakpoint

-- pipeline_stages: leitura para qualquer usuário autenticado, escrita só HEAD
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pipeline_stages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pipeline_stages_select ON pipeline_stages FOR SELECT
  USING ((SELECT app_user_id()) IS NOT NULL);
--> statement-breakpoint
CREATE POLICY pipeline_stages_insert ON pipeline_stages FOR INSERT
  WITH CHECK ((SELECT app_role()) = 'HEAD');
--> statement-breakpoint
CREATE POLICY pipeline_stages_update ON pipeline_stages FOR UPDATE
  USING ((SELECT app_role()) = 'HEAD');
--> statement-breakpoint

-- leads (sem política de DELETE: exclusão é soft delete por HEAD)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    (SELECT app_role()) = 'HEAD'
    OR (deleted_at IS NULL AND (sdr_id = (SELECT app_user_id()) OR closer_has_lead(id)))
  );
--> statement-breakpoint
-- Sem WITH CHECK explícito: a USING vale também para a linha nova (SDR não transfere lead).
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    (SELECT app_role()) = 'HEAD'
    OR (deleted_at IS NULL AND (sdr_id = (SELECT app_user_id()) OR closer_has_lead(id)))
  );
--> statement-breakpoint
CREATE POLICY leads_insert ON leads FOR INSERT
  WITH CHECK (
    (SELECT app_role()) = 'HEAD'
    OR ((SELECT app_role()) = 'SDR' AND sdr_id = (SELECT app_user_id()))
  );
--> statement-breakpoint

-- meetings herdam a visibilidade do lead (subconsulta sujeita à RLS de leads)
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE meetings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY meetings_select ON meetings FOR SELECT
  USING (
    (SELECT app_role()) = 'HEAD'
    OR closer_id = (SELECT app_user_id())
    OR lead_id IN (SELECT id FROM leads)
  );
--> statement-breakpoint
CREATE POLICY meetings_update ON meetings FOR UPDATE
  USING (
    (SELECT app_role()) = 'HEAD'
    OR closer_id = (SELECT app_user_id())
    OR lead_id IN (SELECT id FROM leads)
  );
--> statement-breakpoint
CREATE POLICY meetings_insert ON meetings FOR INSERT
  WITH CHECK (lead_id IN (SELECT id FROM leads));
