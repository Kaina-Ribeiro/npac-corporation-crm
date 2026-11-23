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
--> statement-breakpoint

CREATE OR REPLACE FUNCTION mentoria_fila(agora timestamptz)
  RETURNS TABLE (chave text, tipo text, inscricao_id uuid, referencia_id uuid,
    responsavel_perfil text, responsavel_id text, vence_em timestamptz, atrasado boolean)
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path = public, pg_temp
  SET jit = off
AS $$
  WITH d AS (SELECT mentoria_dia(agora) AS hoje),
  ins AS (
    SELECT x.id, x.mentoria, x.importada, x.criado_em, x.inicio_jornada, x.pme1_enviado_em,
      x.foto_familia_midia_id, x.status, x.responsavel_id, x.termino_previsto,
      (SELECT max(p.fim) FROM mentoria_pausas p
        WHERE p.inscricao_id = x.id AND p.fim IS NOT NULL) AS retomada,
      -- = mentoria_dias_pausados(x.id, hoje)
      (SELECT coalesce(sum(greatest(
          least(coalesce(p.fim, d.hoje), d.hoje)
            - greatest(p.inicio, coalesce(x.inicio_jornada, p.inicio)),
          0)), 0)::int
        FROM mentoria_pausas p WHERE p.inscricao_id = x.id) AS dias_parados
    FROM mentoria_inscricoes x CROSS JOIN d WHERE x.status IN ('ONBOARDING', 'ATIVO')
  ),
  et AS (
    SELECT e.*, ins.importada, ins.criado_em AS cadastro, ins.retomada,
      mentoria_dia(greatest(e.enviada_em,
        ins.retomada::timestamp AT TIME ZONE 'America/Sao_Paulo')) AS base_envio
    FROM mentoria_onboarding_etapas e JOIN ins ON ins.id = e.inscricao_id
  ),
  -- Ciclos das inscrições na Fila, com o prazo atual (segunda chance ou prazo, E16).
  cic AS (
    SELECT c.id, c.inscricao_id, c.numero, c.concluido_em, c.nao_concluido_em,
      coalesce(c.segunda_chance_ate, c.prazo) AS prazo_atual
    FROM mentoria_ciclos c JOIN ins ON ins.id = c.inscricao_id
  ),
  itens AS (
    -- Boas-vindas: inscrição cadastrada (importada não passa pelo onboarding, §7).
    SELECT 'boas-vindas:' || e.inscricao_id AS k, 'BOAS_VINDAS' AS t, e.inscricao_id AS i,
      e.id AS ref, 'OPERACAO' AS perfil, NULL::text AS pessoa,
      mentoria_hora(b.dia, 0) AS vence, d.hoje - b.dia > 3 AS atras
    FROM et e CROSS JOIN d
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(e.cadastro), e.retomada) AS dia) b
    WHERE e.etapa = 'BOAS_VINDAS' AND e.status = 'PENDENTE' AND NOT e.importada

    UNION ALL
    -- Equipe devendo o próximo passo: o anterior fechou há mais de 3 dias.
    SELECT 'passo-devido:' || e.id, 'PASSO_DEVIDO', e.inscricao_id, e.id, 'OPERACAO', NULL,
      mentoria_hora(b.dia, 0), true
    FROM et e CROSS JOIN d
    JOIN (VALUES ('GRUPOS', 'BOAS_VINDAS'), ('AQUECIMENTO', 'GRUPOS'),
      ('PME_AQUECIMENTO', 'AQUECIMENTO')) o(etapa, anterior) ON o.etapa = e.etapa
    JOIN et a ON a.inscricao_id = e.inscricao_id AND a.etapa = o.anterior
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(coalesce(a.concluida_em, a.atualizado_em)),
      e.retomada) AS dia) b
    WHERE e.status = 'PENDENTE' AND a.status IN ('CONCLUIDA', 'DISPENSADA') AND d.hoje - b.dia > 3

    UNION ALL
    -- Passo curto enviado e parado há mais de 3 dias. O PME de aquecimento corre com a Caixa.
    SELECT 'parado:' || e.id, 'PARADO', e.inscricao_id, e.id, 'OPERACAO', NULL,
      mentoria_hora(e.base_envio, 0), true
    FROM et e CROSS JOIN d
    WHERE e.etapa IN ('BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO') AND e.status = 'ENVIADA'
      AND d.hoje - e.base_envio > 3

    UNION ALL
    -- Formulário preenchido e Caixa ainda não enviada; depois de 3 dias, atrasada.
    SELECT 'enviar-caixa:' || c.inscricao_id, 'ENVIAR_CAIXA', c.inscricao_id, c.id, 'OPERACAO',
      NULL, mentoria_hora(b.dia, 0), d.hoje - b.dia > 3
    FROM et c CROSS JOIN d
    JOIN et bv ON bv.inscricao_id = c.inscricao_id AND bv.etapa = 'BOAS_VINDAS'
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(coalesce(bv.formulario_preenchido_em,
      bv.atualizado_em)), c.retomada) AS dia) b
    WHERE c.etapa = 'CAIXA' AND c.status = 'PENDENTE'
      AND (bv.formulario_preenchido IS TRUE OR bv.status = 'DISPENSADA')

    UNION ALL
    -- Caixa enviada há mais de 20 dias sem entrega (D15).
    SELECT 'caixa-atrasada:' || c.inscricao_id, 'CAIXA_ATRASADA', c.inscricao_id, c.id,
      'OPERACAO', NULL, mentoria_hora(c.base_envio, 0), true
    FROM et c CROSS JOIN d
    WHERE c.etapa = 'CAIXA' AND c.status = 'ENVIADA' AND d.hoje - c.base_envio > 20

    UNION ALL
    -- Caixa entregue (ou dispensada) e nenhuma IDR em aberto: a etapa IDR segue a reunião e
    -- volta a PENDENTE depois de FALTOU ou REMARCADA sem nova.
    SELECT 'agendar-idr:' || c.inscricao_id, 'AGENDAR_IDR', c.inscricao_id, r.id, 'OPERACAO',
      NULL, mentoria_hora(mentoria_dia(coalesce(c.concluida_em, c.atualizado_em)), 0), false
    FROM et c JOIN et r ON r.inscricao_id = c.inscricao_id AND r.etapa = 'IDR'
    WHERE c.etapa = 'CAIXA' AND c.status IN ('CONCLUIDA', 'DISPENSADA') AND r.status = 'PENDENTE'

    UNION ALL
    -- Dia da IDR: lembrete de manhã (sai por fila_feitos) e o link (sai com LINK_ENVIADO). O link
    -- vai também para quem conduz, se for do Acompanhamento (o Leo não recebe, F9).
    SELECT 'lembrete-idr:' || r.id, 'LEMBRETE_IDR', r.inscricao_id, r.id, 'OPERACAO', NULL,
      mentoria_hora(d.hoje, 8), false
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN d
    WHERE r.tipo = 'IDR' AND r.status IN ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO')
      AND mentoria_dia(r.inicio) = d.hoje

    UNION ALL
    SELECT 'link-idr:' || r.id, 'LINK_IDR', r.inscricao_id, r.id, 'OPERACAO',
      CASE WHEN mentoria_perfil_de(r.conduzida_por) = 'ACOMPANHAMENTO' THEN r.conduzida_por END,
      r.inicio - interval '30 minutes', agora > r.inicio
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN d
    WHERE r.tipo = 'IDR' AND r.status IN ('AGENDADA', 'CONFIRMADA')
      AND mentoria_dia(r.inicio) = d.hoje

    UNION ALL
    -- IDR realizada no sistema e o 1º PME ainda não enviado.
    SELECT 'enviar-pme1:' || ins.id, 'ENVIAR_PME1', ins.id, NULL, 'OPERACAO', NULL, idr.inicio,
      false
    FROM ins CROSS JOIN LATERAL (SELECT min(r.inicio) AS inicio FROM mentoria_reunioes r
      WHERE r.inscricao_id = ins.id AND r.tipo = 'IDR' AND r.status = 'REALIZADA') idr
    WHERE ins.pme1_enviado_em IS NULL AND idr.inicio IS NOT NULL

    UNION ALL
    -- Ação do plano a partir da data prevista; depois do limite, atrasada. As que vieram antes
    -- do sistema nunca entram (§7). FIM_PME espera o ciclo do número do mês (E21).
    SELECT 'acao:' || a.id, 'ACAO', a.inscricao_id, a.id, a.responsavel_perfil,
      CASE WHEN mentoria_perfil_de(a.responsavel_id) = a.responsavel_perfil
        THEN a.responsavel_id END,
      mentoria_hora(e.dia, 0),
      mentoria_acao_atrasada(a.status, a.anterior_ao_sistema,
        CASE WHEN a.gatilho = 'FIM_PME' THEN e.dia ELSE a.data_limite END, d.hoje)
    FROM mentoria_acoes a JOIN ins ON ins.id = a.inscricao_id CROSS JOIN d
    LEFT JOIN cic c ON a.gatilho = 'FIM_PME' AND c.inscricao_id = a.inscricao_id
      AND c.numero = a.mes
    CROSS JOIN LATERAL (SELECT mentoria_acao_data(a.gatilho, a.mes, a.data_prevista,
      c.id IS NOT NULL, c.concluido_em, c.nao_concluido_em, c.prazo_atual, d.hoje) AS dia) e
    WHERE a.status = 'PENDENTE' AND NOT a.anterior_ao_sistema
      AND (a.gatilho = 'FIM_PME' OR a.data_prevista <= d.hoje) AND e.dia <= d.hoje

    UNION ALL
    -- RDV do mês 10 ao 12 sem a foto da família (presente do mês 11).
    SELECT 'foto-familia:' || ins.id, 'FOTO_FAMILIA', ins.id, NULL, 'OPERACAO', NULL,
      mentoria_hora(mentoria_data_ajustada(ins.id, ins.inicio_jornada,
        mentoria_data_prevista(ins.inicio_jornada, 10, 0)), 0),
      m.mes > 10
    FROM ins CROSS JOIN d
    -- = mentoria_mes_jornada(ins.id, hoje): o dia de hoje sem os dias parados. O OFFSET 0 faz a
    -- conta uma vez por linha (sem ele, o BETWEEN a repetiria).
    CROSS JOIN LATERAL (SELECT d.hoje - ins.dias_parados AS efetivo) j
    CROSS JOIN LATERAL (SELECT CASE
      WHEN ins.inicio_jornada IS NULL OR j.efetivo < ins.inicio_jornada THEN NULL ELSE (
        SELECT max(g)::int FROM generate_series(1, (
          extract(year FROM age(j.efetivo, ins.inicio_jornada)) * 12
          + extract(month FROM age(j.efetivo, ins.inicio_jornada)) + 2)::int) g
        WHERE ins.inicio_jornada + make_interval(months => g - 1) <= j.efetivo
      ) END AS mes OFFSET 0) m
    WHERE ins.mentoria = 'RDV' AND ins.foto_familia_midia_id IS NULL AND m.mes BETWEEN 10 AND 12

    UNION ALL
    -- Todo dia 1º: a arte da agenda e as reuniões mensais do 6M. Ficam até alguém concluir.
    SELECT 'agenda-mes:' || to_char(d.hoje, 'YYYY-MM'), 'AGENDA_MES', NULL, NULL, 'OPERACAO',
      NULL, mentoria_hora(date_trunc('month', d.hoje)::date, 8),
      d.hoje > date_trunc('month', d.hoje)::date
    FROM d

    UNION ALL
    SELECT 'reunioes-6m:' || to_char(d.hoje, 'YYYY-MM'), 'REUNIOES_6M', NULL, NULL, 'OPERACAO',
      NULL, mentoria_hora(date_trunc('month', d.hoje)::date, 8),
      d.hoje > date_trunc('month', d.hoje)::date
    FROM d WHERE EXISTS (SELECT 1 FROM ins WHERE ins.mentoria = '6M')

    UNION ALL
    -- Reunião de hoje, com o status: Operação e quem conduz, se opera o módulo.
    SELECT 'reuniao-hoje:' || r.id, 'REUNIAO_HOJE', r.inscricao_id, r.id, 'OPERACAO',
      CASE WHEN mentoria_perfil_de(r.conduzida_por) IN ('ACOMPANHAMENTO', 'OPERACAO',
        'ESPECIALISTA') THEN r.conduzida_por END,
      r.inicio, false
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN d
    WHERE r.status <> 'REMARCADA' AND mentoria_dia(r.inicio) = d.hoje

    UNION ALL
    -- Cobrança (E17, PDF p. 10): tarefa pendente no dia do prazo, atrasada depois dele. Do
    -- responsável pela inscrição; a da reunião conduzida pela Especialista, dela.
    SELECT 'cobranca:' || t.id, 'COBRANCA', t.inscricao_id, t.id, q.perfil, q.pessoa,
      mentoria_hora(t.data_cobranca, 0), t.data_cobranca < d.hoje
    FROM mentoria_tarefas t JOIN ins ON ins.id = t.inscricao_id CROSS JOIN d
    LEFT JOIN mentoria_reunioes r ON r.id = t.reuniao_id
    CROSS JOIN LATERAL (SELECT coalesce(mentoria_perfil_de(r.conduzida_por) = 'ESPECIALISTA',
      false) AS esp) e
    CROSS JOIN LATERAL (SELECT
      CASE WHEN e.esp THEN 'ESPECIALISTA' ELSE 'ACOMPANHAMENTO' END AS perfil,
      CASE WHEN e.esp THEN r.conduzida_por
        WHEN mentoria_perfil_de(ins.responsavel_id) = 'ACOMPANHAMENTO' THEN ins.responsavel_id
      END AS pessoa) q
    WHERE t.status = 'PENDENTE' AND t.data_cobranca <= d.hoje

    UNION ALL
    -- Semáforo amarelo ou vermelho (E18): um item por semana; "visto nesta semana" conclui.
    SELECT 'semaforo:' || s.inscricao_id || ':'
        || to_char(date_trunc('week', d.hoje::timestamp), 'YYYY-MM-DD'),
      'SEMAFORO', s.inscricao_id, NULL, 'ACOMPANHAMENTO',
      CASE WHEN mentoria_perfil_de(ins.responsavel_id) = 'ACOMPANHAMENTO'
        THEN ins.responsavel_id END,
      mentoria_hora(d.hoje, 0), s.cor = 'VERMELHO'
    FROM d CROSS JOIN LATERAL mentoria_semaforo_lote(d.hoje) s
    JOIN ins ON ins.id = s.inscricao_id
    WHERE s.cor <> 'VERDE'

    UNION ALL
    -- Próximo PME (E19): o ciclo mais recente fechou, ainda cabe outro e a jornada não terminou.
    SELECT 'enviar-pme:' || c.id, 'ENVIAR_PME', c.inscricao_id, c.id, 'OPERACAO', NULL,
      mentoria_hora(c.concluido_em, 0), false
    FROM cic c JOIN ins ON ins.id = c.inscricao_id CROSS JOIN d
    WHERE c.concluido_em IS NOT NULL AND c.numero < 12 AND ins.status = 'ATIVO'
      AND (ins.termino_previsto IS NULL OR d.hoje <= ins.termino_previsto)
      AND NOT EXISTS (SELECT 1 FROM cic n
        WHERE n.inscricao_id = c.inscricao_id AND n.numero > c.numero)

    UNION ALL
    -- Escada de atraso do PME (E20, PDF p. 19): o degrau mais alto alcançado, do prazo atual, até
    -- o contato daquele degrau ou o ciclo fechar.
    SELECT 'pme-atrasado:' || c.id || ':' || to_char(c.prazo_atual, 'YYYY-MM-DD') || ':' || g.degrau,
      'PME_ATRASADO', c.inscricao_id, c.id, 'ACOMPANHAMENTO',
      CASE WHEN mentoria_perfil_de(ins.responsavel_id) = 'ACOMPANHAMENTO'
        THEN ins.responsavel_id END,
      mentoria_hora(c.prazo_atual + g.degrau, 0), true
    FROM cic c JOIN ins ON ins.id = c.inscricao_id CROSS JOIN d
    CROSS JOIN LATERAL (SELECT CASE
      WHEN d.hoje - c.prazo_atual >= 15 THEN 15 WHEN d.hoje - c.prazo_atual >= 10 THEN 10
      WHEN d.hoje - c.prazo_atual >= 7 THEN 7 WHEN d.hoje - c.prazo_atual >= 3 THEN 3
      END AS degrau) g
    WHERE c.concluido_em IS NULL AND c.nao_concluido_em IS NULL AND g.degrau IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mentoria_contatos ct WHERE ct.ciclo_id = c.id
        AND ct.degrau = g.degrau AND ct.degrau_prazo = c.prazo_atual)

    UNION ALL
    -- Nova inscrição (NPAC-56, G4): a venda criou a inscrição sem responsável; a Admin escolhe
    -- (só Admin: SO_ADMIN em sh/mentoria/fila.ts). Sai quando ganha responsável.
    SELECT 'nova-inscricao:' || x.id, 'NOVA_INSCRICAO', x.id, NULL, 'ACOMPANHAMENTO', NULL,
      x.criado_em, false
    FROM mentoria_inscricoes x
    WHERE x.deal_id IS NOT NULL AND x.responsavel_id IS NULL AND x.status <> 'CANCELADO'

    UNION ALL
    -- Venda estornada (M7): o estorno cancelou a inscrição; da responsável (ou do perfil), até o "Visto".
    SELECT 'venda-estornada:' || x.id, 'VENDA_ESTORNADA', x.id, NULL, 'ACOMPANHAMENTO',
      CASE WHEN mentoria_perfil_de(x.responsavel_id) = 'ACOMPANHAMENTO' THEN x.responsavel_id END,
      h.quando, false
    FROM mentoria_inscricoes x
    CROSS JOIN LATERAL (SELECT max(hh.quando) AS quando FROM mentoria_historico hh
      WHERE hh.inscricao_id = x.id AND hh.tipo = 'inscricao.cancelada_pelo_estorno') h
    WHERE x.status = 'CANCELADO' AND h.quando IS NOT NULL
  )
  SELECT x.k, x.t, x.i, x.ref, x.perfil, x.pessoa, x.vence, x.atras
  FROM itens x
  WHERE NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f WHERE f.chave = x.k)
  ORDER BY x.atras DESC, x.vence, x.k
$$;
--> statement-breakpoint

-- Push da Fila (0075 + NPAC-56): "Nova inscrição" para a Admin e "Venda estornada" para a responsável.
CREATE OR REPLACE FUNCTION public.mentoria_avisos_candidatos(agora timestamp with time zone)
 RETURNS TABLE(chave text, quando timestamp with time zone, ate timestamp with time zone, user_ids text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET jit TO 'off'
AS $function$
  WITH d AS (SELECT mentoria_dia(agora) AS hoje),
  ins AS (
    SELECT x.id, x.mentoria, x.responsavel_id,
      (SELECT max(p.fim) FROM mentoria_pausas p
        WHERE p.inscricao_id = x.id AND p.fim IS NOT NULL) AS retomada
    FROM mentoria_inscricoes x WHERE x.status IN ('ONBOARDING', 'ATIVO')
  ),
  et AS (
    SELECT e.*, ins.retomada, mentoria_dia(mentoria_onboarding_base(e.id)) AS base_envio
    FROM mentoria_onboarding_etapas e JOIN ins ON ins.id = e.inscricao_id
  ),
  op AS (SELECT mentoria_destinatarios('OPERACAO', NULL) AS ids),
  -- Quem opera o módulo como Acompanhamento e como Especialista (os critérios de
  -- mentoria_destinatarios/mentoria_perfil_de), lidos uma vez para os itens da Parte 4.
  pf AS (
    SELECT coalesce(array_agg(u.id ORDER BY u.id) FILTER (WHERE mp.cargo = 'ACOMPANHAMENTO'),
        '{}') AS acomp,
      -- "A todos do perfil" (0075): sem quem tem alcance "só a carteira".
      coalesce(array_agg(u.id ORDER BY u.id) FILTER (WHERE mp.cargo = 'ACOMPANHAMENTO'
        AND mp.alcance = 'TODOS'), '{}') AS acomp_todos,
      coalesce(array_agg(u.id ORDER BY u.id) FILTER (WHERE mp.cargo = 'ESPECIALISTA'), '{}') AS esp
    FROM "user" u JOIN area_membros mp ON mp.user_id = u.id AND mp.area = 'ACOMPANHAMENTO'
    WHERE u.active
  ),
  -- Admin do Acompanhamento (selo); sem nenhuma ativa, a Diretoria (NPAC-56).
  adm AS (
    SELECT coalesce(
      (SELECT array_agg(u.id ORDER BY u.id) FROM "user" u
        JOIN area_membros m ON m.user_id = u.id AND m.area = 'ACOMPANHAMENTO' AND m.head
        WHERE u.active),
      (SELECT array_agg(u.id ORDER BY u.id) FROM "user" u WHERE u.active AND u.mestre),
      '{}') AS ids
  ),
  -- = mentoria_destinatarios('ACOMPANHAMENTO', responsável), por inscrição.
  resp AS (
    SELECT ins.id, CASE WHEN ins.responsavel_id = ANY (pf.acomp) THEN ARRAY[ins.responsavel_id]
      ELSE pf.acomp_todos END AS ids
    FROM ins CROSS JOIN pf
  ),
  av AS (
    -- Equipe devendo o próximo passo: no 4º dia, às 8h.
    SELECT 'passo-devido:' || e.id AS k, mentoria_hora(b.dia + 4, 8) AS q,
      NULL::timestamptz AS fim, op.ids AS u
    FROM et e CROSS JOIN op
    JOIN (VALUES ('GRUPOS', 'BOAS_VINDAS'), ('AQUECIMENTO', 'GRUPOS'),
      ('PME_AQUECIMENTO', 'AQUECIMENTO')) o(etapa, anterior) ON o.etapa = e.etapa
    JOIN et a ON a.inscricao_id = e.inscricao_id AND a.etapa = o.anterior
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(coalesce(a.concluida_em, a.atualizado_em)),
      e.retomada) AS dia) b
    WHERE e.status = 'PENDENTE' AND a.status IN ('CONCLUIDA', 'DISPENSADA')

    UNION ALL
    -- Passo curto parado: no 4º dia, às 8h.
    SELECT 'parado:' || e.id, mentoria_hora(e.base_envio + 4, 8), NULL, op.ids
    FROM et e CROSS JOIN op
    WHERE e.etapa IN ('BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO') AND e.status = 'ENVIADA'
      AND e.base_envio IS NOT NULL

    UNION ALL
    -- Caixa sem envio vira alerta no 4º dia.
    SELECT 'enviar-caixa:' || c.inscricao_id, mentoria_hora(b.dia + 4, 8), NULL, op.ids
    FROM et c CROSS JOIN op
    JOIN et bv ON bv.inscricao_id = c.inscricao_id AND bv.etapa = 'BOAS_VINDAS'
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(coalesce(bv.formulario_preenchido_em,
      bv.atualizado_em)), c.retomada) AS dia) b
    WHERE c.etapa = 'CAIXA' AND c.status = 'PENDENTE'
      AND (bv.formulario_preenchido IS TRUE OR bv.status = 'DISPENSADA')

    UNION ALL
    -- Caixa em trânsito: no 21º dia, às 8h.
    SELECT 'caixa-atrasada:' || c.inscricao_id, mentoria_hora(c.base_envio + 21, 8), NULL, op.ids
    FROM et c CROSS JOIN op
    WHERE c.etapa = 'CAIXA' AND c.status = 'ENVIADA' AND c.base_envio IS NOT NULL

    UNION ALL
    -- Dia da IDR: às 8h o lembrete, até a reunião; e o link 30 minutos antes, para a Operação e
    -- para quem conduz, se for do Acompanhamento.
    SELECT 'lembrete-idr:' || r.id, mentoria_hora(mentoria_dia(r.inicio), 8), r.inicio, op.ids
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN op
    WHERE r.tipo = 'IDR' AND r.status IN ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO')
      AND NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f WHERE f.chave = 'lembrete-idr:' || r.id)

    UNION ALL
    SELECT 'link-idr:' || r.id, r.inicio - interval '30 minutes', r.inicio,
      op.ids || CASE WHEN mentoria_perfil_de(r.conduzida_por) = 'ACOMPANHAMENTO'
        THEN ARRAY[r.conduzida_por] ELSE '{}'::text[] END
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN op
    WHERE r.tipo = 'IDR' AND r.status IN ('AGENDADA', 'CONFIRMADA')

    UNION ALL
    -- Ação do plano: às 8h do dia em que entra na Fila, para o responsável (ou o perfil). As que
    -- vieram antes do sistema não avisam (§7); FIM_PME esperando o ciclo também não.
    SELECT 'acao:' || a.id, mentoria_hora(e.dia, 8), mentoria_hora(e.dia + 1, 0),
      mentoria_destinatarios(a.responsavel_perfil, a.responsavel_id)
    FROM mentoria_acoes a JOIN ins ON ins.id = a.inscricao_id CROSS JOIN d
    LEFT JOIN mentoria_ciclos c ON a.gatilho = 'FIM_PME' AND c.inscricao_id = a.inscricao_id
      AND c.numero = a.mes
    CROSS JOIN LATERAL (SELECT mentoria_acao_data(a.gatilho, a.mes, a.data_prevista,
      c.id IS NOT NULL, c.concluido_em, c.nao_concluido_em,
      coalesce(c.segunda_chance_ate, c.prazo), d.hoje) AS dia) e
    WHERE a.status = 'PENDENTE' AND NOT a.anterior_ao_sistema AND e.dia IS NOT NULL

    UNION ALL
    -- Todo dia 1º, às 8h: a arte da agenda e as reuniões do 6M, num aviso só. Este mês e o
    -- próximo, para o despertador saber a próxima.
    SELECT 'dia-1:' || to_char(m.dia, 'YYYY-MM'), mentoria_hora(m.dia, 8),
      mentoria_hora(m.dia + 1, 0), op.ids
    FROM d CROSS JOIN op
    CROSS JOIN LATERAL (VALUES (date_trunc('month', d.hoje)::date),
      ((date_trunc('month', d.hoje) + interval '1 month')::date)) m(dia)
    WHERE NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f
      WHERE f.chave = 'agenda-mes:' || to_char(m.dia, 'YYYY-MM'))

    UNION ALL
    -- Cobrança (E17): às 8h do dia do prazo, só nele; a mesma pessoa da Fila.
    SELECT 'cobranca:' || t.id, mentoria_hora(t.data_cobranca, 8),
      mentoria_hora(t.data_cobranca + 1, 0),
      CASE WHEN r.conduzida_por = ANY (pf.esp) THEN ARRAY[r.conduzida_por] ELSE resp.ids END
    FROM mentoria_tarefas t JOIN resp ON resp.id = t.inscricao_id CROSS JOIN d CROSS JOIN pf
    LEFT JOIN mentoria_reunioes r ON r.id = t.reuniao_id
    WHERE t.status = 'PENDENTE' AND t.data_cobranca >= d.hoje

    UNION ALL
    -- Semáforo vermelho (E18): uma vez por semana por mentorado; "visto nesta semana" não avisa.
    SELECT 'semaforo-vermelho:' || s.inscricao_id || ':' || w.semana,
      mentoria_hora(d.hoje, 8), mentoria_hora(d.hoje + 1, 0), resp.ids
    FROM d CROSS JOIN LATERAL mentoria_semaforo_lote_calc(d.hoje) s
    JOIN resp ON resp.id = s.inscricao_id
    CROSS JOIN LATERAL (SELECT to_char(date_trunc('week', d.hoje::timestamp), 'YYYY-MM-DD')
      AS semana) w
    WHERE s.cor = 'VERMELHO'
      AND NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f
        WHERE f.chave = 'semaforo:' || s.inscricao_id || ':' || w.semana)

    UNION ALL
    -- Escada de atraso do PME (E20): cada degrau às 8h do dia, até o seguinte; o de 15 dias vale
    -- enquanto o ciclo estiver aberto. Contato registrado para o degrau não avisa.
    SELECT 'pme-atrasado:' || c.id || ':' || to_char(p.pa, 'YYYY-MM-DD') || ':' || g.degrau,
      mentoria_hora(p.pa + g.degrau, 8),
      CASE WHEN g.prox IS NOT NULL THEN mentoria_hora(p.pa + g.prox, 0) END, resp.ids
    FROM mentoria_ciclos c JOIN resp ON resp.id = c.inscricao_id
    CROSS JOIN LATERAL (SELECT coalesce(c.segunda_chance_ate, c.prazo) AS pa) p
    CROSS JOIN (VALUES (3, 7), (7, 10), (10, 15), (15, NULL::int)) g(degrau, prox)
    WHERE c.concluido_em IS NULL AND c.nao_concluido_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM mentoria_contatos ct WHERE ct.ciclo_id = c.id
        AND ct.degrau = g.degrau AND ct.degrau_prazo = p.pa)

    UNION ALL
    -- Nova inscrição (NPAC-56, G4): uma vez, para quem é Admin do Acompanhamento.
    SELECT 'nova-inscricao:' || x.id, x.criado_em, NULL, adm.ids
    FROM mentoria_inscricoes x CROSS JOIN adm
    WHERE x.deal_id IS NOT NULL AND x.responsavel_id IS NULL AND x.status <> 'CANCELADO'

    UNION ALL
    -- Venda estornada (M7): uma vez, para a responsável (ou o perfil), menos o "Visto".
    SELECT 'venda-estornada:' || x.id, h.quando, NULL,
      CASE WHEN x.responsavel_id = ANY (pf.acomp) THEN ARRAY[x.responsavel_id] ELSE pf.acomp_todos END
    FROM mentoria_inscricoes x CROSS JOIN pf
    CROSS JOIN LATERAL (SELECT max(hh.quando) AS quando FROM mentoria_historico hh
      WHERE hh.inscricao_id = x.id AND hh.tipo = 'inscricao.cancelada_pelo_estorno') h
    WHERE x.status = 'CANCELADO' AND h.quando IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f WHERE f.chave = 'venda-estornada:' || x.id)
  )
  SELECT av.k, av.q, av.fim, av.u FROM av
  WHERE cardinality(av.u) > 0
    AND NOT EXISTS (SELECT 1 FROM mentoria_avisos_enviados s WHERE s.chave = av.k)
$function$;
