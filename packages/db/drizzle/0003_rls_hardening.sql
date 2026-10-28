-- Endurece as escritas: nenhuma escrita de quem não é HEAD pode ampliar a visibilidade
-- (repassar reunião para outro lead/closer, desfazer cancelamento, trocar SDR, excluir).
-- RLS não compara linha antiga com a nova, então colunas "de posse" ficam em triggers.

-- As funções SECURITY DEFINER pertencem ao npac_owner, que precisa ignorar RLS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'npac_owner' AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'npac_owner precisa ser superuser ou BYPASSRLS';
  END IF;
END
$$;
--> statement-breakpoint

-- Deduplicação só responde a um usuário autenticado e ativo.
CREATE OR REPLACE FUNCTION lead_contact_taken(bidx text, insta text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT app_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM leads l
    WHERE l.deleted_at IS NULL
      AND ((bidx IS NOT NULL AND l.phone_bidx = bidx) OR (insta IS NOT NULL AND l.instagram = insta))
  )
$$;
--> statement-breakpoint

-- Só HEAD muda dono, closer, autoria ou exclusão do lead.
CREATE FUNCTION leads_guard_owner_columns() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_app' AND app_role() IS DISTINCT FROM 'HEAD' AND (
       NEW.sdr_id IS DISTINCT FROM OLD.sdr_id
    OR NEW.closer_id IS DISTINCT FROM OLD.closer_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  ) THEN
    RAISE EXCEPTION 'só HEAD altera SDR, closer, autoria ou exclusão do lead'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER leads_guard_owner_columns BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_guard_owner_columns();
--> statement-breakpoint

-- Só HEAD muda lead, closer ou autoria da reunião, ou desfaz um cancelamento.
CREATE FUNCTION meetings_guard_owner_columns() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_app' AND app_role() IS DISTINCT FROM 'HEAD' AND (
       NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.closer_id IS DISTINCT FROM OLD.closer_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR (OLD.canceled_at IS NOT NULL AND NEW.canceled_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'só HEAD altera lead, closer ou autoria da reunião, ou desfaz cancelamento'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER meetings_guard_owner_columns BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION meetings_guard_owner_columns();
--> statement-breakpoint

-- O closer só enxerga as próprias reuniões não canceladas.
DROP POLICY meetings_select ON meetings;
--> statement-breakpoint
DROP POLICY meetings_update ON meetings;
--> statement-breakpoint
DROP POLICY meetings_insert ON meetings;
--> statement-breakpoint
CREATE POLICY meetings_select ON meetings FOR SELECT
  USING (
    (SELECT app_role()) = 'HEAD'
    OR (closer_id = (SELECT app_user_id()) AND canceled_at IS NULL)
    OR lead_id IN (SELECT id FROM leads)
  );
--> statement-breakpoint
CREATE POLICY meetings_update ON meetings FOR UPDATE
  USING (
    (SELECT app_role()) = 'HEAD'
    OR (closer_id = (SELECT app_user_id()) AND canceled_at IS NULL)
    OR lead_id IN (SELECT id FROM leads)
  )
  WITH CHECK (
    (SELECT app_role()) = 'HEAD'
    OR lead_id IN (SELECT id FROM leads)
  );
--> statement-breakpoint
-- Agendar: HEAD ou SDR, em lead visível, como autor, com um closer ativo de verdade.
CREATE POLICY meetings_insert ON meetings FOR INSERT
  WITH CHECK (
    (SELECT app_role()) IN ('HEAD', 'SDR')
    AND created_by = (SELECT app_user_id())
    AND lead_id IN (SELECT id FROM leads)
    AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = closer_id AND u.active AND u.can_close)
  );
