-- Cancelar a última reunião revoga a própria visibilidade. O comando usa
-- SECURITY DEFINER estritamente para esta transição; não aceita campos livres.
CREATE FUNCTION cancel_meeting(target uuid, expected_version integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid text := app_user_id(); changed integer;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  UPDATE meetings m SET canceled_at = now(), updated_at = now(), version = version + 1
  WHERE m.id = target AND m.version = expected_version AND m.canceled_at IS NULL
    AND EXISTS (SELECT 1 FROM leads l WHERE l.id = m.lead_id AND l.deleted_at IS NULL
      AND (app_role() = 'HEAD'
        OR (app_role() = 'SDR' AND l.sdr_id = uid)
        OR (app_role() = 'CLOSER' AND m.closer_id = uid)));
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END $$;
--> statement-breakpoint
ALTER FUNCTION cancel_meeting(uuid, integer) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cancel_meeting(uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cancel_meeting(uuid, integer) TO npac_app;
