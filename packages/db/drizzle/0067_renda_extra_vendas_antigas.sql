-- NPAC-51 (Gabriel, 18/11/2026, "1B"): a renda extra do SDR (0066) entrou sem olhar para trás. O
-- lead que já estava em Venda Fechada como "venda a registrar" ficou sem marcação e, por isso, fora
-- do balão "Valor a receber por venda feita" e da coluna Vendas do SDR (que conta a marcação).
-- Aqui cada um desses leads ganha a marcação que teria se a 0066 já existisse:
--   SDR      = o dono do lead (como em "Marcar venda" e no cadastro em Venda Fechada);
--   produto  = o informado no lead (sem produto não há valor: fica de fora);
--   reunião  = a realizada mais recente, pelo horário (a mesma que decide o closer da venda);
--   valor    = a renda extra do produto no catálogo de hoje;
--   data     = quando o lead virou "venda a registrar" (timeline `sale.pending`); sem esse registro,
--              agora, por quem é o SDR do lead.
-- Venda já registrada, lead excluído e lead que já tem marcação ativa não mudam.
INSERT INTO sdr_sale_marks (lead_id, sdr_id, product_id, meeting_id, bonus_cents, marked_by, marked_at)
SELECT l.id, l.sdr_id, p.id, m.id, p.sdr_bonus_cents,
  coalesce(t.actor_id, l.sdr_id), coalesce(t.at, now())
FROM leads l
JOIN pipeline_stages s ON s.id = l.stage_id AND s.key = 'VENDA'
JOIN products p ON p.id = l.sold_product_id
JOIN LATERAL (
  SELECT m.id FROM meetings m
  WHERE m.lead_id = l.id AND m.outcome = 'DONE' AND m.canceled_at IS NULL
  ORDER BY m.scheduled_at DESC, m.id DESC
  LIMIT 1
) m ON true
LEFT JOIN LATERAL (
  SELECT t.actor_id, t.at FROM lead_timeline t
  WHERE t.lead_id = l.id AND t.kind = 'sale.pending'
  ORDER BY t.at DESC
  LIMIT 1
) t ON true
WHERE l.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = l.id AND d.reversed_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM sdr_sale_marks k WHERE k.lead_id = l.id AND k.canceled_at IS NULL);
