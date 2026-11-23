ALTER TABLE "area_membros" DROP CONSTRAINT "area_membros_acompanhamento";--> statement-breakpoint
CREATE UNIQUE INDEX "mentoria_envios_presente_unico" ON "mentoria_envios_fisicos" USING btree ("inscricao_id") WHERE "mentoria_envios_fisicos"."tipo" = 'PRESENTE_FAMILIA';--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_acompanhamento" CHECK ("area_membros"."area" <> 'ACOMPANHAMENTO' or ("area_membros"."cargo" is null and not "area_membros"."head")
        or ("area_membros"."cargo" is not null
          and "area_membros"."cargo" in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR', 'ENVIOS')));--> statement-breakpoint

-- NPAC-56, Parte 2 (spec docs/superpowers/specs/2026-11-19-acompanhamento-gestao-bloco-1-design.md, G7, G8, G10,
-- M4–M6): cargo Envios (a Maria) no Acompanhamento. Ela não lê nada do módulo pela RLS: as funções de leitura
-- (mentoria_ve_todas, mentoria_ids_visiveis, mentoria_edita…) não a conhecem, como o Mentor. Ela usa só
-- mentoria_envios_lista (nome, endereço e a foto do presente) e mentoria_envio_marcar (enviado e entregue).

-- ------------------------------------------------------------------ cargo
CREATE OR REPLACE FUNCTION area_definir_membro(alvo text, nova_area text, novo_cargo text, novo_head boolean,
  novo_alcance text)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  alvo_mestre boolean;
  h boolean;
BEGIN
  IF nova_area IS NULL OR nova_area NOT IN ('COMERCIAL', 'ACOMPANHAMENTO') THEN
    RAISE EXCEPTION 'Área inválida' USING ERRCODE = '22023';
  END IF;
  IF novo_alcance IS NOT NULL AND novo_alcance NOT IN ('TODOS', 'CARTEIRA') THEN
    RAISE EXCEPTION 'Alcance inválido' USING ERRCODE = '22023';
  END IF;
  SELECT u.mestre INTO alvo_mestre FROM "user" u WHERE u.id = alvo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF alvo_mestre THEN
    RAISE EXCEPTION 'A Diretoria não tem cargo por área' USING ERRCODE = '22023';
  END IF;
  PERFORM area_exigir(area_decidir(alvo, 'CARGO', nova_area, novo_cargo, novo_head));
  IF nova_area = 'COMERCIAL' THEN
    IF novo_cargo IS NULL OR novo_cargo NOT IN ('SDR', 'CLOSER', 'HEAD') THEN
      RAISE EXCEPTION 'Cargo inválido para a área' USING ERRCODE = '22023';
    END IF;
    h := novo_cargo = 'HEAD';
  ELSE
    IF novo_cargo IS NOT NULL
      AND novo_cargo NOT IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR', 'ENVIOS') THEN
      RAISE EXCEPTION 'Cargo inválido para a área' USING ERRCODE = '22023';
    END IF;
    h := novo_cargo IS NOT NULL AND coalesce(novo_head, false);
  END IF;
  IF novo_alcance = 'CARTEIRA' AND (nova_area <> 'ACOMPANHAMENTO'
      OR novo_cargo IS DISTINCT FROM 'ACOMPANHAMENTO' OR h) THEN
    RAISE EXCEPTION 'Só a carteira vale só para o cargo Acompanhamento' USING ERRCODE = '22023';
  END IF;
  INSERT INTO area_membros (user_id, area, cargo, head, alcance, definido_por)
    VALUES (alvo, nova_area, novo_cargo, h, coalesce(novo_alcance, 'TODOS'), app_user_id())
    ON CONFLICT (user_id, area) DO UPDATE
    SET cargo = excluded.cargo, head = excluded.head,
        alcance = coalesce(novo_alcance, area_membros.alcance),
        definido_por = excluded.definido_por, definido_em = now();
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION area_definir_mestre(alvo text, valor boolean, nova_area text DEFAULT NULL,
  novo_cargo text DEFAULT NULL, novo_head boolean DEFAULT false) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  atual boolean;
  h boolean;
  antes text := current_setting('npac.area_sync', true);
BEGIN
  PERFORM area_exigir(area_decidir(alvo, 'MESTRE', novo_mestre => coalesce(valor, false)));
  SELECT u.mestre INTO atual FROM "user" u WHERE u.id = alvo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF valor IS NULL OR valor = atual THEN RETURN; END IF;
  IF valor THEN
    PERFORM set_config('npac.area_sync', 'on', true);
    DELETE FROM area_membros m WHERE m.user_id = alvo;
    UPDATE "user" u SET mestre = true WHERE u.id = alvo;
    PERFORM set_config('npac.area_sync', coalesce(antes, ''), true);
    PERFORM area_sincronizar(alvo);
    RETURN;
  END IF;
  IF nova_area = 'COMERCIAL' AND novo_cargo IN ('SDR', 'CLOSER', 'HEAD') THEN
    h := novo_cargo = 'HEAD';
  ELSIF nova_area = 'ACOMPANHAMENTO' AND (novo_cargo IS NULL
      OR novo_cargo IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR', 'ENVIOS')) THEN
    h := novo_cargo IS NOT NULL AND coalesce(novo_head, false);
  ELSE
    RAISE EXCEPTION 'Diga a área e o cargo de destino' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('npac.area_sync', 'on', true);
  UPDATE "user" u SET mestre = false WHERE u.id = alvo;
  INSERT INTO area_membros (user_id, area, cargo, head, definido_por)
    VALUES (alvo, nova_area, novo_cargo, h, app_user_id());
  PERFORM set_config('npac.area_sync', coalesce(antes, ''), true);
  PERFORM area_sincronizar(alvo);
END $$;
--> statement-breakpoint

-- Há alguém ativo no cargo Envios? (M4: a Caixa da Fila vai para ela; sem ninguém, para a Operação.)
CREATE FUNCTION mentoria_tem_envios() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM "user" u
    JOIN area_membros m ON m.user_id = u.id AND m.area = 'ACOMPANHAMENTO'
    WHERE u.active AND m.cargo = 'ENVIOS')
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ envios

-- Os envios das inscrições em Onboarding, Ativo ou Pausado (interna: sem conferir quem pede; a lista, a
-- escrita e o push conferem). Sem linha ainda (Caixa e presente nunca marcados): envio_id nulo, versão 0.
--   A enviar: Caixa com o formulário do endereço marcado (G8; ou boas-vindas dispensada, como a Fila) e a
--     etapa ainda pendente; presente com a foto da família recebida (M5); kit e certificado preparando (G10).
--   Em trânsito: enviado. Entregues: nos últimos 30 dias.
CREATE FUNCTION mentoria_envios_calc(agora timestamptz)
  RETURNS TABLE (envio_id uuid, inscricao_id uuid, tipo text, status text, enviado_em date,
    entregue_em date, rastreio text, version int)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  SET jit = off
AS $$
  WITH d AS (SELECT mentoria_dia(agora) AS hoje),
  ins AS (
    SELECT x.id, x.foto_familia_midia_id FROM mentoria_inscricoes x
    WHERE x.status IN ('ONBOARDING', 'ATIVO', 'PAUSADO')
  )
  SELECT v.id, v.inscricao_id, v.tipo, v.status, v.enviado_em, v.entregue_em, v.rastreio, v.version
  FROM mentoria_envios_fisicos v JOIN ins ON ins.id = v.inscricao_id CROSS JOIN d
  WHERE v.status = 'ENVIADO'
    OR (v.status = 'ENTREGUE' AND v.entregue_em >= d.hoje - 30)
    OR (v.status = 'PREPARANDO' AND v.tipo IN ('KIT', 'CERTIFICADO'))

  UNION ALL
  SELECT v.id, c.inscricao_id, 'CAIXA', 'PREPARANDO', NULL, NULL, NULL, coalesce(v.version, 0)
  FROM mentoria_onboarding_etapas c JOIN ins ON ins.id = c.inscricao_id
  JOIN mentoria_onboarding_etapas bv ON bv.inscricao_id = c.inscricao_id AND bv.etapa = 'BOAS_VINDAS'
  LEFT JOIN mentoria_envios_fisicos v ON v.inscricao_id = c.inscricao_id AND v.tipo = 'CAIXA'
  WHERE c.etapa = 'CAIXA' AND c.status = 'PENDENTE'
    AND (bv.formulario_preenchido IS TRUE OR bv.status = 'DISPENSADA')
    AND (v.id IS NULL OR v.status = 'PREPARANDO')

  UNION ALL
  SELECT v.id, ins.id, 'PRESENTE_FAMILIA', 'PREPARANDO', NULL, NULL, NULL, coalesce(v.version, 0)
  FROM ins
  LEFT JOIN mentoria_envios_fisicos v ON v.inscricao_id = ins.id AND v.tipo = 'PRESENTE_FAMILIA'
  WHERE ins.foto_familia_midia_id IS NOT NULL AND (v.id IS NULL OR v.status = 'PREPARANDO')
$$;
--> statement-breakpoint

-- Quem usa a aba: Admin, Acompanhamento, Operação e Envios. 42501 para os demais (a API responde 404).
CREATE FUNCTION mentoria_envios_exigir() RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (mentoria_admin()
      OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO', 'ENVIOS'), false)) THEN
    RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501';
  END IF;
END $$;
--> statement-breakpoint

-- O cargo Envios (sem o selo) vê todos os envios, só com nome, endereço (cifrado; a API decifra) e a foto
-- do presente ainda não entregue. A gestão vê os das inscrições que já vê (carteira, Especialista: RLS).
CREATE FUNCTION mentoria_envios_lista(agora timestamptz)
  RETURNS TABLE (envio_id uuid, inscricao_id uuid, tipo text, status text, nome1 text, nome2 text,
    endereco text, cep text, foto_midia_id uuid, enviado_em date, entregue_em date, rastreio text,
    version int)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  SET jit = off
AS $$
#variable_conflict use_column
DECLARE
  envios boolean;
  todas boolean;
  visiveis uuid[];
BEGIN
  PERFORM mentoria_envios_exigir();
  envios := NOT mentoria_admin() AND coalesce(mentoria_perfil() = 'ENVIOS', false);
  todas := envios OR mentoria_ve_todas();
  visiveis := CASE WHEN todas THEN '{}'::uuid[] ELSE mentoria_ids_visiveis() END;
  RETURN QUERY
    SELECT c.envio_id, c.inscricao_id, c.tipo, c.status,
      (SELECT p.nome FROM mentoria_pessoas p WHERE p.inscricao_id = c.inscricao_id AND p.ordem = 1),
      (SELECT p.nome FROM mentoria_pessoas p WHERE p.inscricao_id = c.inscricao_id AND p.ordem = 2),
      e.endereco, e.cep,
      CASE WHEN c.tipo = 'PRESENTE_FAMILIA' AND c.status <> 'ENTREGUE' THEN i.foto_familia_midia_id END,
      c.enviado_em, c.entregue_em, c.rastreio, c.version
    FROM mentoria_envios_calc(agora) c
    JOIN mentoria_inscricoes i ON i.id = c.inscricao_id
    LEFT JOIN mentoria_enderecos e ON e.inscricao_id = c.inscricao_id
    WHERE todas OR c.inscricao_id = ANY (visiveis)
    ORDER BY c.status, c.enviado_em NULLS FIRST, c.entregue_em DESC NULLS FIRST, c.inscricao_id, c.tipo;
END $$;
--> statement-breakpoint

-- A única escrita do envio pela aba (enviado com data e rastreio; entregue com data). O envio tem de estar
-- na lista (mentoria_envios_calc): Caixa sem formulário, inscrição cancelada ou envio entregue não mudam.
-- A Caixa segue o gatilho mentoria_caixa_segue_envio (entregue conclui a etapa CAIXA). Devolve a versão nova.
CREATE FUNCTION mentoria_envio_marcar(p_inscricao uuid, p_tipo text, p_envio uuid, p_version int,
  p_status text, p_data date, p_rastreio text, p_agora timestamptz)
  RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  eu text := app_user_id();
  atual record;
  nova int;
  rastreio_limpo text := nullif(btrim(coalesce(p_rastreio, '')), '');
  nome text;
BEGIN
  PERFORM mentoria_envios_exigir();
  IF (mentoria_admin() OR mentoria_perfil() IS DISTINCT FROM 'ENVIOS')
      AND NOT mentoria_edita('ONBOARDING', p_inscricao) THEN
    RAISE EXCEPTION 'Envio não encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- Duas pessoas no mesmo envio: a segunda espera e confere a versão.
  PERFORM pg_advisory_xact_lock(hashtext('mentoria_envio:' || p_inscricao || ':' || p_tipo));
  SELECT * INTO atual FROM mentoria_envios_calc(p_agora) c
    WHERE c.inscricao_id = p_inscricao AND c.tipo = p_tipo
      AND c.envio_id IS NOT DISTINCT FROM p_envio;
  IF NOT FOUND THEN
    -- A Caixa ou o presente ganhou linha desde a leitura (outra aba): conflito, não 404.
    IF p_envio IS NULL AND EXISTS (SELECT 1 FROM mentoria_envios_fisicos v
        WHERE v.inscricao_id = p_inscricao AND v.tipo = p_tipo) THEN
      RAISE EXCEPTION 'Conflito de versão' USING ERRCODE = 'P0409';
    END IF;
    RAISE EXCEPTION 'Envio não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF atual.version <> p_version THEN
    RAISE EXCEPTION 'Conflito de versão' USING ERRCODE = 'P0409';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION '%', CASE WHEN p_status = 'ENTREGUE' THEN 'Informe a data de recebimento'
      ELSE 'Informe a data de envio' END USING ERRCODE = '22023';
  END IF;
  IF p_status = 'ENVIADO' THEN
    IF atual.status <> 'PREPARANDO' THEN
      RAISE EXCEPTION 'Este envio já foi marcado como enviado' USING ERRCODE = '22023';
    END IF;
    IF char_length(rastreio_limpo) > 120 THEN
      RAISE EXCEPTION 'O rastreio passa de 120 caracteres' USING ERRCODE = '22023';
    END IF;
    IF p_envio IS NULL THEN
      INSERT INTO mentoria_envios_fisicos (inscricao_id, tipo, status, enviado_em, rastreio, criado_por)
        VALUES (p_inscricao, p_tipo, 'ENVIADO', p_data, rastreio_limpo, eu)
        RETURNING version INTO nova;
    ELSE
      UPDATE mentoria_envios_fisicos v SET status = 'ENVIADO', enviado_em = p_data,
          rastreio = rastreio_limpo, version = v.version + 1, atualizado_em = now()
        WHERE v.id = p_envio AND v.version = p_version
        RETURNING v.version INTO nova;
    END IF;
  ELSIF p_status = 'ENTREGUE' THEN
    IF atual.status <> 'ENVIADO' THEN
      RAISE EXCEPTION 'Marque como enviado antes' USING ERRCODE = '22023';
    END IF;
    IF p_data < atual.enviado_em THEN
      RAISE EXCEPTION 'O recebimento não pode ser antes do envio' USING ERRCODE = '22023';
    END IF;
    UPDATE mentoria_envios_fisicos v SET status = 'ENTREGUE', entregue_em = p_data,
        version = v.version + 1, atualizado_em = now()
      WHERE v.id = p_envio AND v.version = p_version
      RETURNING v.version INTO nova;
  ELSE
    RAISE EXCEPTION 'Situação inválida' USING ERRCODE = '22023';
  END IF;
  IF nova IS NULL THEN RAISE EXCEPTION 'Conflito de versão' USING ERRCODE = 'P0409'; END IF;
  nome := CASE p_tipo WHEN 'CAIXA' THEN 'caixa' WHEN 'PRESENTE_FAMILIA' THEN 'presente'
    WHEN 'KIT' THEN 'kit' ELSE 'certificado' END;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (p_inscricao, eu,
      nome || CASE WHEN p_status = 'ENTREGUE' THEN '.entregue'
        WHEN p_tipo = 'CAIXA' THEN '.enviada' ELSE '.enviado' END,
      CASE WHEN p_status = 'ENVIADO' THEN ARRAY['status', 'enviado_em', 'rastreio']
        ELSE ARRAY['status', 'entregue_em'] END);
  RETURN nova;
END $$;
--> statement-breakpoint

-- A foto da família da inscrição fica legível para o cargo Envios enquanto o presente não foi entregue (M5).
CREATE FUNCTION mentoria_envio_foto_ve(midia uuid, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT NOT mentoria_admin() AND mentoria_perfil() = 'ENVIOS' AND EXISTS (
    SELECT 1 FROM mentoria_inscricoes i
    WHERE i.id = inscricao AND i.foto_familia_midia_id = midia
      AND i.status IN ('ONBOARDING', 'ATIVO', 'PAUSADO')
      AND NOT EXISTS (SELECT 1 FROM mentoria_envios_fisicos v
        WHERE v.inscricao_id = i.id AND v.tipo = 'PRESENTE_FAMILIA' AND v.status = 'ENTREGUE'))
$$;
--> statement-breakpoint
ALTER POLICY mentoria_midia_leitura ON mentoria_midia USING (
  mentoria_midia_ve(dono_tipo, dono_id)
  OR (dono_tipo = 'FOTO_FAMILIA' AND mentoria_envio_foto_ve(id, dono_id))
);
--> statement-breakpoint

-- ------------------------------------------------------------------ Fila (M4) e push (M6)
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
    -- Formulário preenchido e Caixa ainda não enviada; depois de 3 dias, atrasada. Vai para o cargo
    -- Envios quando há alguém ativo nele; sem ninguém, para a Operação (NPAC-56, M4).
    SELECT 'enviar-caixa:' || c.inscricao_id, 'ENVIAR_CAIXA', c.inscricao_id, c.id,
      CASE WHEN (SELECT mentoria_tem_envios()) THEN 'ENVIOS' ELSE 'OPERACAO' END,
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
  -- Cargo Envios ativo (NPAC-56, M6).
  env AS (SELECT mentoria_destinatarios('ENVIOS', NULL) AS ids),
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
    -- Com alguém no cargo Envios (M4), ela recebe o "Tem envio para hoje" das 8h no lugar deste.
    SELECT 'enviar-caixa:' || c.inscricao_id, mentoria_hora(b.dia + 4, 8), NULL,
      CASE WHEN cardinality(env.ids) > 0 THEN '{}'::text[] ELSE op.ids END
    FROM et c CROSS JOIN op CROSS JOIN env
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

    UNION ALL
    -- Envios físicos (NPAC-56, M6): às 8h, uma vez por dia, a quem tem o cargo Envios, se há algo a
    -- enviar. Vale até o fim do dia (API parada o dia inteiro não manda o de ontem).
    SELECT 'envios:' || d.hoje, mentoria_hora(d.hoje, 8), mentoria_hora(d.hoje + 1, 0), env.ids
    FROM d CROSS JOIN env
    WHERE EXISTS (SELECT 1 FROM mentoria_envios_calc(agora) c WHERE c.status = 'PREPARANDO')
  )
  SELECT av.k, av.q, av.fim, av.u FROM av
  WHERE cardinality(av.u) > 0
    AND NOT EXISTS (SELECT 1 FROM mentoria_avisos_enviados s WHERE s.chave = av.k)
$function$;
--> statement-breakpoint

ALTER FUNCTION mentoria_tem_envios() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_envios_calc(timestamptz) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_envios_exigir() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_envios_lista(timestamptz) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_envio_marcar(uuid, text, uuid, int, text, date, text, timestamptz) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_envio_foto_ve(uuid, uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_tem_envios(), mentoria_envios_calc(timestamptz), mentoria_envios_exigir(),
  mentoria_envios_lista(timestamptz), mentoria_envio_marcar(uuid, text, uuid, int, text, date, text, timestamptz),
  mentoria_envio_foto_ve(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_tem_envios(), mentoria_envios_lista(timestamptz),
  mentoria_envio_marcar(uuid, text, uuid, int, text, date, text, timestamptz), mentoria_envio_foto_ve(uuid, uuid)
  TO npac_app;
