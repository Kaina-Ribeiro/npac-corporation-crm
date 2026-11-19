-- NPAC-54, Fase 2 (plano docs/plans/acesso-por-area.md, spec "Regra única de quem gerencia quem"):
-- a regra de quem gerencia quem passa a ser uma só, igual à função pura `podeGerenciar`
-- (packages/shared/src/areas.ts). `area_regra` é a gêmea dela, sem ler tabela; as duas rodam o mesmo
-- arquivo de casos (packages/shared/test/areas-casos.ts, db/test/areas-regra.test.ts). As funções
-- que escrevem o cargo (area_definir_membro, area_remover_membro, area_definir_mestre), area_gerencia e
-- push_purge_user passam a decidir por ela. Fecha o achado: o selo de Admin do Acompanhamento só pela
-- Diretoria. A compatibilidade da Fase 1 (visão mentoria_perfis, gatilhos de user.role) fica igual.

-- Veredito: 'OK' ou '<INVISIVEL|PROIBIDO|PROPRIO>|<motivo>'. `ator` e `alvo` = {mestre, areas:
-- [{area, cargo, head}]}; `alvo` nulo quando a ação não é sobre uma conta (convite, pedido). Mudou
-- aqui, mude podeGerenciar e o arquivo de casos.
CREATE FUNCTION area_regra(ator jsonb, alvo jsonb, proprio boolean, acao text, nova_area text,
  novo_cargo text, novo_head boolean, novo_mestre boolean, pedido_area text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
DECLARE
  heads text[];
  pede_head boolean;
  alvo_head text;
  motivo_head text;
  destino text;
  dar_head text := CASE nova_area WHEN 'ACOMPANHAMENTO'
    THEN 'Só a Diretoria dá o selo de Admin do Acompanhamento'
    ELSE 'Só a Diretoria pode dar cargo de Head ou Diretoria' END;
  cargo_de text := CASE nova_area WHEN 'ACOMPANHAMENTO'
    THEN 'Só a Diretoria pode dar cargo de Acompanhamento'
    ELSE 'Só a Diretoria pode dar cargo do Comercial' END;
BEGIN
  IF coalesce(proprio, false) AND acao IN ('CARGO', 'DESATIVAR', 'REMOVER_AREA', 'MESTRE') THEN
    RETURN 'PROPRIO|Você não pode remover o próprio cargo';
  END IF;
  IF coalesce((ator->>'mestre')::boolean, false) THEN RETURN 'OK'; END IF;

  SELECT coalesce(array_agg(x.a ORDER BY x.o), '{}') INTO heads
  FROM (VALUES ('COMERCIAL', 1), ('ACOMPANHAMENTO', 2)) x(a, o)
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(ator->'areas', '[]')) v
    WHERE v->>'area' = x.a AND coalesce((v->>'head')::boolean, false));
  IF cardinality(heads) = 0 THEN RETURN 'PROIBIDO|Acesso negado'; END IF;

  IF acao = 'VER_PEDIDO' THEN
    RETURN CASE WHEN pedido_area = ANY (heads) THEN 'OK' ELSE 'INVISIVEL|Não encontrado' END;
  END IF;

  -- No Comercial o Head é o cargo HEAD; no Acompanhamento, o selo.
  pede_head := CASE WHEN nova_area = 'COMERCIAL' THEN coalesce(novo_cargo = 'HEAD', false)
    ELSE coalesce(novo_head, false) END;

  IF acao IN ('CONVIDAR', 'APROVAR') THEN
    IF acao = 'APROVAR' AND NOT coalesce(pedido_area = ANY (heads), false) THEN
      RETURN 'INVISIVEL|Não encontrado';
    END IF;
    IF nova_area IS NULL THEN RETURN 'PROIBIDO|Acesso negado'; END IF;
    IF coalesce(novo_mestre, false) THEN
      RETURN 'PROIBIDO|Só a Diretoria pode dar cargo de Head ou Diretoria';
    END IF;
    IF pede_head THEN RETURN 'PROIBIDO|' || dar_head; END IF;
    -- Aprova só com cargo da área do pedido (M9).
    destino := CASE WHEN acao = 'APROVAR' THEN pedido_area ELSE nova_area END;
    IF NOT (nova_area = ANY (heads)) OR nova_area IS DISTINCT FROM destino THEN
      RETURN 'PROIBIDO|' || cargo_de;
    END IF;
    RETURN 'OK';
  END IF;

  -- Daqui em diante a ação é sobre uma conta: o Head enxerga quem tem vínculo numa área dele.
  IF alvo IS NULL OR coalesce((alvo->>'mestre')::boolean, false)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(alvo->'areas', '[]')) v
      WHERE v->>'area' = ANY (heads)) THEN
    RETURN 'INVISIVEL|Não encontrado';
  END IF;
  IF acao = 'VER' THEN RETURN 'OK'; END IF;

  SELECT e.v->>'area' INTO alvo_head
  FROM jsonb_array_elements(alvo->'areas') WITH ORDINALITY e(v, i)
  WHERE coalesce((e.v->>'head')::boolean, false) ORDER BY e.i LIMIT 1;
  motivo_head := CASE WHEN alvo_head = 'ACOMPANHAMENTO' AND alvo_head = ANY (heads)
    THEN 'Só a Diretoria administra contas de Admin do Acompanhamento'
    ELSE 'Só a Diretoria administra contas de Head ou Diretoria' END;

  IF acao = 'CARGO' THEN
    IF nova_area IS NULL THEN RETURN 'PROIBIDO|Acesso negado'; END IF;
    IF pede_head THEN RETURN 'PROIBIDO|' || dar_head; END IF;
    IF NOT (nova_area = ANY (heads)) THEN RETURN 'PROIBIDO|' || cargo_de; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(alvo->'areas') v
      WHERE v->>'area' = nova_area) THEN
      RETURN 'PROIBIDO|Só a Diretoria põe ou tira alguém de uma área';
    END IF;
    IF alvo_head IS NOT NULL THEN RETURN 'PROIBIDO|' || motivo_head; END IF;
    RETURN 'OK';
  END IF;
  IF acao IN ('CONTA', 'DESATIVAR') THEN
    IF jsonb_array_length(alvo->'areas') > 1 THEN
      RETURN 'PROIBIDO|Conta em mais de uma área: só a Diretoria redefine a senha ou desativa';
    END IF;
    IF alvo_head IS NOT NULL THEN RETURN 'PROIBIDO|' || motivo_head; END IF;
    RETURN 'OK';
  END IF;
  IF acao = 'REMOVER_AREA' THEN
    RETURN 'PROIBIDO|Só a Diretoria põe ou tira alguém de uma área';
  END IF;
  RETURN 'PROIBIDO|Só a Diretoria pode dar cargo de Head ou Diretoria';
END $$;
--> statement-breakpoint

-- O que a regra sabe de uma conta: {mestre, areas} (áreas em ordem alfabética). Nulo se não existe.
CREATE FUNCTION area_conta_json(uid text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('mestre', u.mestre, 'areas', coalesce(
    (SELECT jsonb_agg(jsonb_build_object('area', m.area, 'cargo', m.cargo, 'head', m.head)
      ORDER BY m.area) FROM area_membros m WHERE m.user_id = u.id), '[]'::jsonb))
  FROM "user" u WHERE u.id = uid
$$;
--> statement-breakpoint
-- A regra com quem está logado (conta ativa; sem sessão, sem poder nenhum) e o alvo lido do banco.
CREATE FUNCTION area_decidir(alvo text, acao text, nova_area text DEFAULT NULL,
  novo_cargo text DEFAULT NULL, novo_head boolean DEFAULT false, novo_mestre boolean DEFAULT false,
  pedido_area text DEFAULT NULL) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT area_regra(
    coalesce(area_conta_json(app_user_id()), '{"mestre": false, "areas": []}'::jsonb),
    area_conta_json(alvo), alvo IS NOT NULL AND alvo = app_user_id(), acao, nova_area,
    novo_cargo, novo_head, novo_mestre, pedido_area)
$$;
--> statement-breakpoint
-- Recusa com 42501: o motivo da regra, ou "Acesso negado" para o que o Head não enxerga.
CREATE FUNCTION area_exigir(veredito text) RETURNS void
  LANGUAGE plpgsql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF veredito = 'OK' THEN RETURN; END IF;
  IF veredito LIKE 'INVISIVEL|%' THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION '%', split_part(veredito, '|', 2) USING ERRCODE = '42501';
END $$;
--> statement-breakpoint

-- Contas e vínculos para a API aplicar a regra (lista do Admin, carregar o alvo): só para a Mestre e
-- os Heads. A API filtra pela regra (VER) e esconde o cargo da outra área.
CREATE FUNCTION area_contas() RETURNS TABLE(user_id text, mestre boolean, areas jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT u.id, (j->>'mestre')::boolean, j->'areas'
  FROM "user" u CROSS JOIN LATERAL area_conta_json(u.id) j
  WHERE coalesce((SELECT cardinality(area_head_areas())), 0) > 0
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ funções que escrevem o cargo

-- Cria ou troca o vínculo de `alvo` em `nova_area` pela regra única (ação CARGO). Comercial: head =
-- (cargo = HEAD). Acompanhamento: cargo nulo = "falta perfil" (sem selo).
CREATE OR REPLACE FUNCTION area_definir_membro(alvo text, nova_area text, novo_cargo text,
  novo_head boolean)
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
      AND novo_cargo NOT IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR') THEN
      RAISE EXCEPTION 'Cargo inválido para a área' USING ERRCODE = '22023';
    END IF;
    h := novo_cargo IS NOT NULL AND coalesce(novo_head, false);
  END IF;
  INSERT INTO area_membros (user_id, area, cargo, head, definido_por)
    VALUES (alvo, nova_area, novo_cargo, h, app_user_id())
    ON CONFLICT (user_id, area) DO UPDATE
    SET cargo = excluded.cargo, head = excluded.head,
        definido_por = excluded.definido_por, definido_em = now();
END $$;
--> statement-breakpoint
-- Tira `alvo` de uma área (regra: só a Diretoria, nunca a própria); recusa tirar a última.
CREATE OR REPLACE FUNCTION area_remover_membro(alvo text, area_alvo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM area_exigir(area_decidir(alvo, 'REMOVER_AREA', area_alvo));
  IF NOT EXISTS (SELECT 1 FROM area_membros m WHERE m.user_id = alvo AND m.area = area_alvo) THEN
    RAISE EXCEPTION 'Vínculo não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM area_membros m WHERE m.user_id = alvo AND m.area <> area_alvo) THEN
    RAISE EXCEPTION 'A conta precisa de ao menos uma área' USING ERRCODE = '22023';
  END IF;
  DELETE FROM area_membros m WHERE m.user_id = alvo AND m.area = area_alvo;
END $$;
--> statement-breakpoint
-- Dá ou tira a Diretoria (regra: só a Diretoria, nunca a própria). Ao virar Diretoria os vínculos
-- saem; ao deixar de ser, `nova_area` e `novo_cargo` dizem para onde vai. A última Diretoria ativa
-- nunca sai (gatilho user_ao_menos_um_mestre).
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
  ELSIF nova_area = 'ACOMPANHAMENTO'
    AND (novo_cargo IS NULL OR novo_cargo IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR')) THEN
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
-- Quem está logado pode mexer na conta inteira de `alvo` (senha, MFA, desativar)? A regra única
-- (ação CONTA): a Diretoria, sempre; o Head da área, em conta só da área dele que não é Head.
CREATE OR REPLACE FUNCTION area_gerencia(alvo text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.id = alvo) AND area_decidir(alvo, 'CONTA') = 'OK'
$$;
--> statement-breakpoint
-- Desativar usuário apaga as inscrições de push dele: quem pode mexer na conta (era só a liderança).
CREATE OR REPLACE FUNCTION push_purge_user(target text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT area_gerencia(target) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  DELETE FROM push_subscriptions WHERE user_id = target;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION area_regra(jsonb, jsonb, boolean, text, text, text, boolean, boolean, text),
  area_conta_json(text), area_decidir(text, text, text, text, boolean, boolean, text),
  area_exigir(text), area_contas() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION area_contas() TO npac_app;
