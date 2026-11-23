-- NPAC-68 (Igor, 23/11/2026): o SDR marca a venda de um lead em Agendou Pagamento, e o closer da venda
-- é o do pagamento (`leads.closer_id`), que pode não ter reunião com o lead. Sem isto ele perdia o
-- lead ao virar "venda a registrar" (Venda sem venda ativa) e não conseguia registrar o valor.
-- O closer do lead passa a vê-lo também nesse estado. Mesma regra nas duas funções (a política lê a
-- lista; gatilhos e outras funções leem closer_has_lead).
CREATE OR REPLACE FUNCTION closer_has_lead(lead uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM meetings m
    WHERE m.lead_id = lead AND m.closer_id = app_user_id() AND m.canceled_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
    WHERE l.id = lead AND l.closer_id = app_user_id() AND (
      s.key = 'AGENDOU_PAGAMENTO'
      OR EXISTS (SELECT 1 FROM deals d
        WHERE d.lead_id = l.id AND d.closer_id = l.closer_id AND d.reversed_at IS NULL)
      OR (s.key = 'VENDA' AND NOT EXISTS (SELECT 1 FROM deals d
        WHERE d.lead_id = l.id AND d.reversed_at IS NULL))
    )
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION closer_lead_ids() RETURNS uuid[]
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
      OR (s.key = 'VENDA' AND NOT EXISTS (SELECT 1 FROM deals d
        WHERE d.lead_id = l.id AND d.reversed_at IS NULL))
    )
  ) x
$$;
