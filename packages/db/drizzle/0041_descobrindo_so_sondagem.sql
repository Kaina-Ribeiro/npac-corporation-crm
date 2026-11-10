-- "Descobrindo renda" (Igor, 10/11/2026): o lead fica só em Criando Relacionamento (SONDAGEM, a
-- etapa de descobrir os dados) e só vai para a reunião quando a renda é descoberta. A API responde
-- 409 INCOME_REQUIRED antes; aqui fica a garantia para todo caminho (venda, massa, importação).
CREATE FUNCTION leads_descobrindo_so_sondagem() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.income_band::text = 'DESCOBRINDO'
     AND (SELECT key FROM pipeline_stages WHERE id = NEW.stage_id) IS DISTINCT FROM 'SONDAGEM' THEN
    RAISE EXCEPTION 'Lead em Descobrindo renda fica em Criando Relacionamento'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'leads_descobrindo_sondagem';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER leads_descobrindo_so_sondagem BEFORE INSERT OR UPDATE OF income_band, stage_id ON leads
FOR EACH ROW EXECUTE FUNCTION leads_descobrindo_so_sondagem();
--> statement-breakpoint
CREATE FUNCTION meetings_renda_descoberta() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT income_band::text FROM leads WHERE id = NEW.lead_id) = 'DESCOBRINDO' THEN
    RAISE EXCEPTION 'Reunião só depois de descobrir a renda do lead'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'meetings_renda_descoberta';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER meetings_renda_descoberta BEFORE INSERT ON meetings
FOR EACH ROW EXECUTE FUNCTION meetings_renda_descoberta();
