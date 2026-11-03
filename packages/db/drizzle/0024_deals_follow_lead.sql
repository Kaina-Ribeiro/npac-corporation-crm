-- A venda acompanha o lead: quem enxerga o lead enxerga a venda (SDR atual, closer da agenda,
-- liderança), como já acontece com parcelas, notas e tarefas. A política antiga exigia
-- sdr_id = eu (o SDR da época): ao transferir um lead vendido, o novo SDR não via a venda, e os
-- checks "existe venda ativa?" (sair de Venda, registrar outra venda, cobranças do Hoje) falhavam.
DROP POLICY deals_read ON deals;
--> statement-breakpoint
CREATE POLICY deals_read ON deals FOR SELECT USING (
  (SELECT app_role()) = 'HEAD' OR lead_id IN (SELECT id FROM leads)
);
