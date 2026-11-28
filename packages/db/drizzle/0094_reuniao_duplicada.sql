-- NPAC-82 (Igor, 27/11/2026): "marquei realizada as duas reuniões e somou 2x os ganhos, mas é pra somar 1 só".
-- O "Concluir tarefa" de antes do NPAC-81 criava outra reunião igual (mesmo lead, mesmo horário), e as duas
-- realizadas contavam no valor por reunião. Das reuniões não canceladas do mesmo lead no mesmo minuto fica
-- uma: a da renda extra da venda, senão a realizada, senão a que tem resultado, senão a mais antiga. As
-- outras viram canceladas (nada é apagado; o card da ficha mostra "Cancelada") e saem das contas.
WITH repetidas AS (
  SELECT m.id, row_number() OVER (
      PARTITION BY m.lead_id, date_trunc('minute', m.scheduled_at AT TIME ZONE 'UTC')
      ORDER BY EXISTS (SELECT 1 FROM sdr_sale_marks k WHERE k.meeting_id = m.id) DESC,
        m.outcome IS NOT DISTINCT FROM 'DONE' DESC,
        m.outcome IS NOT NULL DESC,
        m.created_at, m.id
    ) AS n
  FROM meetings m
  WHERE m.canceled_at IS NULL
)
UPDATE meetings SET canceled_at = now(), version = version + 1, updated_at = now()
WHERE id IN (SELECT id FROM repetidas WHERE n > 1);
--> statement-breakpoint

-- O UPDATE deixa pendente o gatilho adiado do canal ao vivo (app_revision_meetings, 0062), e o Postgres não
-- cria índice em tabela com evento pendente na transação: dispara agora e volta a adiar depois do índice
-- (num banco novo todas as migrations rodam na mesma transação).
SET CONSTRAINTS app_revision_meetings IMMEDIATE;
--> statement-breakpoint

-- Daqui em diante o banco recusa a repetição (a API responde antes, 409 MEETING_EXISTS).
CREATE UNIQUE INDEX meetings_lead_minuto_uniq
  ON meetings (lead_id, date_trunc('minute', scheduled_at AT TIME ZONE 'UTC'))
  WHERE canceled_at IS NULL;
--> statement-breakpoint

SET CONSTRAINTS app_revision_meetings DEFERRED;
