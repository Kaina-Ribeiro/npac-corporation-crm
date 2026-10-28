CREATE FUNCTION lead_contact_taken(bidx text, insta text, exclude_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM leads l WHERE l.deleted_at IS NULL AND l.id <> exclude_id
    AND ((bidx IS NOT NULL AND l.phone_bidx = bidx) OR (insta IS NOT NULL AND l.instagram = insta))
  )
$$;
--> statement-breakpoint
ALTER FUNCTION lead_contact_taken(text, text, uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lead_contact_taken(text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lead_contact_taken(text, text, uuid) TO npac_app;
