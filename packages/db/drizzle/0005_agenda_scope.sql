-- Closer acessa apenas as próprias reuniões; SDR acessa reuniões dos seus leads.
DROP POLICY meetings_select ON meetings;
--> statement-breakpoint
DROP POLICY meetings_update ON meetings;
--> statement-breakpoint
CREATE POLICY meetings_select ON meetings FOR SELECT USING (
  (SELECT app_role()) = 'HEAD'
  OR ((SELECT app_role()) = 'CLOSER' AND closer_id = (SELECT app_user_id()) AND canceled_at IS NULL)
  OR ((SELECT app_role()) = 'SDR' AND lead_id IN (SELECT id FROM leads WHERE sdr_id = (SELECT app_user_id())))
);
--> statement-breakpoint
CREATE POLICY meetings_update ON meetings FOR UPDATE USING (
  (SELECT app_role()) = 'HEAD'
  OR ((SELECT app_role()) = 'CLOSER' AND closer_id = (SELECT app_user_id()) AND canceled_at IS NULL)
  OR ((SELECT app_role()) = 'SDR' AND lead_id IN (SELECT id FROM leads WHERE sdr_id = (SELECT app_user_id())))
) WITH CHECK (
  (SELECT app_role()) = 'HEAD'
  OR ((SELECT app_role()) = 'CLOSER' AND closer_id = (SELECT app_user_id()))
  OR ((SELECT app_role()) = 'SDR' AND lead_id IN (SELECT id FROM leads WHERE sdr_id = (SELECT app_user_id())))
);
--> statement-breakpoint
-- Notas e tarefas têm tabelas próprias no plano 02. Closer pode mover etapa,
-- mas não editar campos pessoais/qualificação de um lead da agenda.
CREATE FUNCTION leads_guard_closer_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user = 'npac_app' AND app_role() = 'CLOSER' AND
    (to_jsonb(NEW) - ARRAY['stage_id','version','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['stage_id','version','updated_at']) THEN
    RAISE EXCEPTION 'closer só pode mover a etapa do lead' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER leads_guard_closer_fields BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION leads_guard_closer_fields();
