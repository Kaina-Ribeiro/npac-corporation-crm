-- Desempenho, Fase 3 (docs/plans/desempenho.md, T3.1, decisão D2): o canal ao vivo deixa de
-- resumir (md5) todos os leads, tarefas, timeline, chat e avisos a cada 2 s por aba. Agora há um
-- contador global de uma linha: toda transação que escreve nessas tabelas (e em `meetings` e
-- `deals`, que decidem quais leads o closer vê: o resumo antigo, sob a RLS, pegava essa troca)
-- soma 1, e a API lê `n` a cada 2 s, uma vez por processo. Qualquer escrita avisa todas as abas
-- (sem dado nenhum).
--
-- O gatilho é CONSTRAINT TRIGGER adiado para o commit (e não FOR EACH STATEMENT imediato), por dois
-- motivos: (1) a linha do contador fica travada só no fim da transação, então uma transação longa
-- não segura as escritas das outras e não há deadlock com quem já travou um lead e espera o
-- contador; (2) o aviso sai depois que a escrita está pronta para ficar visível. Por linha porque
-- o Postgres só adia gatilho por linha; o `set_config` local faz o UPDATE rodar uma vez por
-- transação, por maior que ela seja.
CREATE TABLE "app_revision" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"n" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "app_revision_uma_linha" CHECK ("app_revision"."id")
);
--> statement-breakpoint
INSERT INTO app_revision (id, n) VALUES (true, 0);
--> statement-breakpoint
ALTER TABLE app_revision ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY app_revision_leitura ON app_revision FOR SELECT TO npac_app USING (true);
--> statement-breakpoint
GRANT SELECT ON app_revision TO npac_app;
--> statement-breakpoint
CREATE FUNCTION app_revision_bump() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  -- UPDATE que não muda nada não avisa: o Chat grava "lido até" com o mesmo valor a cada recarga,
  -- e sem isto cada aviso geraria outro (o resumo antigo também não mudava nesse caso).
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;
  IF current_setting('app.revision_bumped', true) IS DISTINCT FROM 'sim' THEN
    PERFORM set_config('app.revision_bumped', 'sim', true);
    UPDATE app_revision SET n = n + 1 WHERE id;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
ALTER FUNCTION app_revision_bump() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_revision_bump() FROM PUBLIC;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_leads AFTER INSERT OR UPDATE OR DELETE ON leads
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_lead_tasks AFTER INSERT OR UPDATE OR DELETE ON lead_tasks
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_lead_timeline AFTER INSERT OR UPDATE OR DELETE ON lead_timeline
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_chat_messages AFTER INSERT OR UPDATE OR DELETE ON chat_messages
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_chat_channels AFTER INSERT OR UPDATE OR DELETE ON chat_channels
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_chat_reads AFTER INSERT OR UPDATE OR DELETE ON chat_reads
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_notifications AFTER INSERT OR UPDATE OR DELETE ON notifications
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_meetings AFTER INSERT OR UPDATE OR DELETE ON meetings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER app_revision_deals AFTER INSERT OR UPDATE OR DELETE ON deals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_revision_bump();
