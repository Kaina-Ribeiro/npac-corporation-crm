-- NPAC-59 (Igor, 23/11/2026, "A"): o SDR que põe o lead em Agendou Pagamento com o produto já fez a
-- venda dele; ao registrar a venda, a API passa a gravar a renda extra (`recordPaymentSaleMark`).
-- Aqui as vendas registradas antes disso, vindas de Agendou Pagamento, ganham a marcação que teriam:
--   origem   = `deals.previous_stage_id` é Agendou Pagamento (o lead estava lá ao registrar);
--   SDR      = o dono do lead;
--   produto  = o da venda (o produto informado no pagamento é apagado ao registrar);
--   reunião  = a realizada mais recente até o registro (sem nenhuma, fica de fora, como na API);
--   valor    = a renda extra do produto no catálogo de hoje;
--   data/por = a data da venda e quem a registrou.
-- Só vendas desde 17/11/2026 (início da renda extra, NPAC-48). Venda estornada, lead excluído ou fora
-- da Venda e lead que já tem marcação ativa não mudam.
INSERT INTO sdr_sale_marks (lead_id, sdr_id, product_id, meeting_id, bonus_cents, marked_by, marked_at)
SELECT d.lead_id, l.sdr_id, p.id, m.id, p.sdr_bonus_cents, d.created_by, d.closed_at
FROM deals d
JOIN pipeline_stages ps ON ps.id = d.previous_stage_id AND ps.key = 'AGENDOU_PAGAMENTO'
JOIN leads l ON l.id = d.lead_id AND l.deleted_at IS NULL
JOIN pipeline_stages s ON s.id = l.stage_id AND s.key = 'VENDA'
JOIN products p ON p.id = d.product_id
JOIN LATERAL (
  SELECT m.id FROM meetings m
  WHERE m.lead_id = d.lead_id AND m.outcome = 'DONE' AND m.canceled_at IS NULL
    AND m.scheduled_at <= d.closed_at
  ORDER BY m.scheduled_at DESC, m.id DESC
  LIMIT 1
) m ON true
WHERE d.reversed_at IS NULL
  AND d.closed_at >= '2026-11-17T03:00:00Z'
  AND NOT EXISTS (SELECT 1 FROM sdr_sale_marks k WHERE k.lead_id = d.lead_id AND k.canceled_at IS NULL);
