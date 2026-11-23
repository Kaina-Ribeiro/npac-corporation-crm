ALTER TABLE "products" ADD COLUMN "mentoria" text;--> statement-breakpoint
ALTER TABLE "mentoria_inscricoes" ADD COLUMN "deal_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "mentoria_inscricoes_deal" ON "mentoria_inscricoes" USING btree ("deal_id") WHERE "mentoria_inscricoes"."deal_id" is not null;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "product_mentoria" CHECK ("products"."mentoria" in ('RDV', '2M', '6M'));
--> statement-breakpoint

-- NPAC-56 (Eduarda 1A–5A, 19/11/2026): a venda de RDV, 2M ou 6M registrada pelo closer vira mentorado
-- no Acompanhamento, na mesma transação (G9). O produto diz qual mentoria cria (M1), preenchido como a 0066.
UPDATE products SET mentoria = CASE
    WHEN code = 'RDV' OR lower(name) = lower('Mentoria RDV') THEN 'RDV'
    WHEN code = 'MENTORIA_2M' OR lower(name) = lower('Mentoria 2M') THEN '2M'
    WHEN code = 'MENTORIA_6M' OR lower(name) = lower('Mentoria 6M') THEN '6M'
  END
WHERE code IN ('RDV', 'MENTORIA_2M', 'MENTORIA_6M')
  OR lower(name) IN (lower('Mentoria RDV'), lower('Mentoria 2M'), lower('Mentoria 6M'));
--> statement-breakpoint

-- `deal_id` (sem FK: a venda nunca é apagada e a FK travaria o `truncate deals` dos testes) e a situação
-- do pagamento de inscrição com venda só pelo banco: a venda grava pela função abaixo (dona npac_owner) e
-- a situação vem das parcelas (M8).
CREATE FUNCTION mentoria_inscricoes_venda_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.deal_id IS NOT NULL THEN
      RAISE EXCEPTION 'Inscrição da venda só pelo registro da venda' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.deal_id IS DISTINCT FROM OLD.deal_id THEN
    RAISE EXCEPTION 'A venda da inscrição não muda' USING ERRCODE = '22023';
  END IF;
  IF NEW.deal_id IS NOT NULL AND NEW.status_financeiro IS DISTINCT FROM OLD.status_financeiro THEN
    RAISE EXCEPTION 'A situação do pagamento vem das parcelas do comercial' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_inscricoes_venda_guarda
  BEFORE INSERT OR UPDATE OF deal_id, status_financeiro ON mentoria_inscricoes
  FOR EACH ROW EXECUTE FUNCTION mentoria_inscricoes_venda_guarda();
--> statement-breakpoint

-- Cria a inscrição a partir da venda que quem está logado acabou de registrar (G2–G4). O contato chega
-- já cifrado pela API com a chave do Acompanhamento (AAD da pessoa). O closer não lê nem escreve o
-- módulo: só executa esta função. Recusa (22023) venda inexistente, de outra pessoa, estornada, já ligada
-- ou de produto que não vira mentorado. Sem responsável: a Admin escolhe pela Fila ("Nova inscrição").
CREATE FUNCTION mentoria_inscricao_da_venda(p_deal uuid, p_inscricao uuid, p_pessoa uuid,
    p_nome text, p_nome_norm text, p_whatsapp text, p_whatsapp_idx text, p_email text,
    p_email_idx text, p_instagram text)
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  d record;
  eu text := app_user_id();
BEGIN
  SELECT x.id, x.closed_at, x.total_cents, x.method, x.reversed_at, x.created_by, p.mentoria
    INTO d
    FROM deals x JOIN products p ON p.id = x.product_id
    WHERE x.id = p_deal FOR UPDATE OF x;
  IF NOT FOUND OR eu IS NULL OR d.created_by IS DISTINCT FROM eu THEN
    RAISE EXCEPTION 'Venda não encontrada' USING ERRCODE = '22023';
  END IF;
  IF d.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Venda estornada' USING ERRCODE = '22023';
  END IF;
  IF d.mentoria IS NULL THEN
    RAISE EXCEPTION 'O produto da venda não vira mentorado' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM mentoria_inscricoes i WHERE i.deal_id = p_deal) THEN
    RAISE EXCEPTION 'A venda já tem inscrição' USING ERRCODE = '22023';
  END IF;
  INSERT INTO mentoria_inscricoes (id, tipo, mentoria, data_compra, valor_centavos, forma_pagamento,
      status, deal_id, criado_por)
    VALUES (p_inscricao, 'INDIVIDUAL', d.mentoria,
      (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date, d.total_cents,
      CASE d.method WHEN 'CARD' THEN 'Cartão' WHEN 'PIX' THEN 'Pix' WHEN 'BANK_SLIP' THEN 'Boleto'
        WHEN 'PARTIAL' THEN 'Parcial' END,
      'ONBOARDING', p_deal, eu);
  INSERT INTO mentoria_pessoas (id, inscricao_id, ordem, nome, nome_norm, whatsapp, whatsapp_idx,
      email, email_idx, instagram, criado_por)
    VALUES (p_pessoa, p_inscricao, 1, p_nome, p_nome_norm, p_whatsapp, p_whatsapp_idx, p_email,
      p_email_idx, p_instagram, eu);
  -- As seis etapas do cadastro manual (ETAPAS de sh/mentoria/onboarding.ts).
  INSERT INTO mentoria_onboarding_etapas (inscricao_id, etapa, status, criado_por)
    SELECT p_inscricao, e, 'PENDENTE', eu
    FROM unnest(ARRAY['BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO', 'PME_AQUECIMENTO', 'CAIXA', 'IDR']) e;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (p_inscricao, eu, 'inscricao.criada_pela_venda', '{}');
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, data)
    VALUES (eu, 'mentoria.inscricao_da_venda', 'mentoria_inscricao', p_inscricao::text,
      jsonb_build_object('dealId', p_deal));
  RETURN p_inscricao;
END $$;
--> statement-breakpoint

-- Estorno (G5): a inscrição da venda vira Cancelada; nada é apagado (reuniões, ações e contatos ficam).
-- Pausada: a pausa fecha no dia. O aviso é o item "Venda estornada" da Fila (M7), pelo histórico.
CREATE FUNCTION mentoria_venda_estornada() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  i record;
  ator text := coalesce(app_user_id(), NEW.reversed_by);
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  FOR i IN SELECT x.id, x.status FROM mentoria_inscricoes x
           WHERE x.deal_id = NEW.id AND x.status <> 'CANCELADO' FOR UPDATE LOOP
    IF i.status = 'PAUSADO' THEN
      UPDATE mentoria_pausas SET fim = greatest(inicio, hoje), retomada_por = ator
        WHERE inscricao_id = i.id AND fim IS NULL;
    END IF;
    UPDATE mentoria_inscricoes SET status = 'CANCELADO', version = version + 1, atualizado_em = now()
      WHERE id = i.id;
    INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
      VALUES (i.id, ator, 'inscricao.cancelada_pelo_estorno', '{}');
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id, data)
      VALUES (ator, 'mentoria.cancelada_pelo_estorno', 'mentoria_inscricao', i.id::text,
        jsonb_build_object('dealId', NEW.id));
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER deals_mentoria_estorno AFTER UPDATE OF reversed_at ON deals
  FOR EACH ROW WHEN (OLD.reversed_at IS NULL AND NEW.reversed_at IS NOT NULL)
  EXECUTE FUNCTION mentoria_venda_estornada();
--> statement-breakpoint

-- Situação do pagamento (G6, M8): sem venda, a coluna; com venda, as parcelas. Só o rótulo, nunca valor
-- de parcela, e só para quem vê a inscrição.
CREATE FUNCTION mentoria_status_financeiro(p_inscricao uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN i.deal_id IS NULL THEN i.status_financeiro
    WHEN NOT EXISTS (SELECT 1 FROM payments p WHERE p.deal_id = i.deal_id AND p.paid_at IS NULL)
      THEN 'QUITADO'
    WHEN EXISTS (SELECT 1 FROM payments p WHERE p.deal_id = i.deal_id AND p.paid_at IS NULL
      AND p.due_at < now()) THEN 'EM_ATRASO'
    ELSE 'EM_DIA' END
  FROM mentoria_inscricoes i
  WHERE i.id = p_inscricao AND mentoria_ve(p_inscricao)
$$;
--> statement-breakpoint
ALTER FUNCTION mentoria_inscricoes_venda_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_inscricao_da_venda(uuid, uuid, uuid, text, text, text, text, text, text, text)
  OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_venda_estornada() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_status_financeiro(uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_inscricao_da_venda(uuid, uuid, uuid, text, text, text, text, text, text, text),
  mentoria_venda_estornada(), mentoria_status_financeiro(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_inscricao_da_venda(uuid, uuid, uuid, text, text, text, text, text, text, text),
  mentoria_status_financeiro(uuid) TO npac_app;
