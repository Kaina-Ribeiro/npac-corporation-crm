-- Desempenho, Fase 1 (docs/plans/desempenho.md, T1.3): a leitura e a escrita de leads deixam de
-- chamar closer_has_lead(id) linha a linha. A lista de leads do closer é calculada uma vez por
-- consulta (`(select closer_lead_ids())` vira um InitPlan) e a política só compara o id com ela.
-- Mesma semântica de closer_has_lead: reunião não cancelada do closer; ou leads.closer_id dele com
-- o lead em Agendou Pagamento ou com venda ativa dele. closer_has_lead continua existindo (gatilhos
-- e outras funções a usam).
CREATE FUNCTION closer_lead_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  WITH eu AS (SELECT app_user_id() AS id)
  SELECT coalesce(array_agg(DISTINCT x.id), '{}'::uuid[]) FROM (
    SELECT m.lead_id AS id FROM meetings m, eu
    WHERE m.closer_id = eu.id AND m.canceled_at IS NULL
    UNION
    SELECT l.id FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id, eu
    WHERE l.closer_id = eu.id AND (
      s.key = 'AGENDOU_PAGAMENTO'
      OR EXISTS (SELECT 1 FROM deals d
        WHERE d.lead_id = l.id AND d.closer_id = l.closer_id AND d.reversed_at IS NULL)
    )
  ) x
$$;
--> statement-breakpoint
ALTER FUNCTION closer_lead_ids() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION closer_lead_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION closer_lead_ids() TO npac_app;
--> statement-breakpoint
ALTER POLICY leads_select ON leads USING (
  (SELECT app_role()) = 'HEAD'::role
  OR (deleted_at IS NULL AND (sdr_id = (SELECT app_user_id())
      OR id = ANY ((SELECT closer_lead_ids())::uuid[])))
);
--> statement-breakpoint
ALTER POLICY leads_update ON leads USING (
  (SELECT app_role()) = 'HEAD'::role
  OR (deleted_at IS NULL AND (sdr_id = (SELECT app_user_id())
      OR id = ANY ((SELECT closer_lead_ids())::uuid[])))
);
