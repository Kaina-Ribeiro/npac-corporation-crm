-- Escrita protegida do Acompanhamento. Toda função SECURITY DEFINER checa mentoria_pode() no
-- corpo (roda como owner e ignora RLS) e recusa com 42501. Conflito de version = P0409, que a
-- API traduz para 409 VERSION_CONFLICT. Filhos usam a version do pai (D5): a função trava o
-- pai, compara e incrementa. Valores sensíveis chegam já cifrados pela API.

-- Role do worker de mídia: sem login; o npac_app entra nele com SET LOCAL ROLE só no worker.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'npac_media_worker') THEN
    CREATE ROLE npac_media_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT npac_media_worker TO npac_app;
--> statement-breakpoint

CREATE FUNCTION mentoria_exigir_acesso() RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT mentoria_pode() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
END $$;
--> statement-breakpoint

-- Trava a pessoa do RDV, compara a version e devolve a nova (incrementada).
CREATE FUNCTION mentoria_travar_pessoa(pessoa uuid, expected_version int) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE atual int;
BEGIN
  SELECT version INTO atual FROM mentoria_rdv_pessoas WHERE id = pessoa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF atual <> expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'P0409';
  END IF;
  UPDATE mentoria_rdv_pessoas
    SET version = atual + 1, updated_by = app_user_id(), updated_at = now()
    WHERE id = pessoa;
  RETURN atual + 1;
END $$;
--> statement-breakpoint

CREATE FUNCTION mentoria_travar_ficha(ficha uuid, expected_version int) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE atual int;
BEGIN
  SELECT version INTO atual FROM mentoria_fichas WHERE id = ficha FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF atual <> expected_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'P0409';
  END IF;
  UPDATE mentoria_fichas
    SET version = atual + 1, updated_by = app_user_id(), updated_at = now()
    WHERE id = ficha;
  RETURN atual + 1;
END $$;
--> statement-breakpoint

-- Diagnóstico colado (regra 5, D30): mescla por campo. Só as chaves presentes mudam.
CREATE FUNCTION mentoria_colar_diagnostico(pessoa uuid, expected_version int, dados jsonb)
  RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE nova int; desconhecida text;
BEGIN
  PERFORM mentoria_exigir_acesso();
  SELECT k INTO desconhecida FROM jsonb_object_keys(dados) k
    WHERE k NOT IN ('idade', 'situacao_conjugal', 'filhos', 'trabalho', 'renda_atual',
      'dinheiro_guardado', 'patrimonio', 'dividas', 'sonhos_objetivos')
    LIMIT 1;
  IF desconhecida IS NOT NULL THEN
    RAISE EXCEPTION 'Campo de diagnóstico desconhecido' USING ERRCODE = '22023';
  END IF;
  nova := mentoria_travar_pessoa(pessoa, expected_version);
  INSERT INTO mentoria_rdv_diagnostico (pessoa_id, colado_por) VALUES (pessoa, app_user_id())
    ON CONFLICT (pessoa_id) DO NOTHING;
  UPDATE mentoria_rdv_diagnostico SET
    idade = CASE WHEN dados ? 'idade' THEN dados->>'idade' ELSE idade END,
    situacao_conjugal = CASE WHEN dados ? 'situacao_conjugal' THEN dados->>'situacao_conjugal' ELSE situacao_conjugal END,
    filhos = CASE WHEN dados ? 'filhos' THEN dados->>'filhos' ELSE filhos END,
    trabalho = CASE WHEN dados ? 'trabalho' THEN dados->>'trabalho' ELSE trabalho END,
    renda_atual = CASE WHEN dados ? 'renda_atual' THEN dados->>'renda_atual' ELSE renda_atual END,
    dinheiro_guardado = CASE WHEN dados ? 'dinheiro_guardado' THEN dados->>'dinheiro_guardado' ELSE dinheiro_guardado END,
    patrimonio = CASE WHEN dados ? 'patrimonio' THEN dados->>'patrimonio' ELSE patrimonio END,
    dividas = CASE WHEN dados ? 'dividas' THEN dados->>'dividas' ELSE dividas END,
    sonhos_objetivos = CASE WHEN dados ? 'sonhos_objetivos' THEN dados->>'sonhos_objetivos' ELSE sonhos_objetivos END,
    colado_em = now(),
    colado_por = app_user_id()
  WHERE pessoa_id = pessoa;
  RETURN nova;
END $$;
--> statement-breakpoint

-- Link da pasta (regra 5): só por colagem. O CHECK da coluna aplica a allowlist (D38).
CREATE FUNCTION mentoria_colar_link_pasta(pessoa uuid, expected_version int, url text)
  RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE nova int;
BEGIN
  PERFORM mentoria_exigir_acesso();
  nova := mentoria_travar_pessoa(pessoa, expected_version);
  UPDATE mentoria_rdv_pessoas SET pasta_url = url, pasta_colada_em = now() WHERE id = pessoa;
  RETURN nova;
END $$;
--> statement-breakpoint

-- Confirmar dúvida (D21): exige data; cria o evento e marca a dúvida na mesma transação. O id
-- do evento vem da API, que cifrou a descrição com o AAD desse id.
CREATE FUNCTION mentoria_confirmar_duvida(
  duvida uuid, expected_version int, evento uuid, data_texto text, data date,
  descricao_cifrada text, checklist int
) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE dono uuid; situacao text; nova int;
BEGIN
  PERFORM mentoria_exigir_acesso();
  SELECT pessoa_id, status INTO dono, situacao FROM mentoria_rdv_duvidas WHERE id = duvida;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF data IS NULL THEN
    RAISE EXCEPTION 'Informe a data (DD/MM/AAAA)' USING ERRCODE = '22023';
  END IF;
  nova := mentoria_travar_pessoa(dono, expected_version);
  IF situacao <> 'ABERTA' THEN
    RAISE EXCEPTION 'Esta dúvida já foi resolvida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO mentoria_rdv_eventos
    (id, pessoa_id, data_texto, data, descricao, origem, checklist_item, duvida_id, created_by, updated_by)
    VALUES (evento, dono, data_texto, data, descricao_cifrada, 'DUVIDA_CONFIRMADA', checklist,
      duvida, app_user_id(), app_user_id());
  UPDATE mentoria_rdv_duvidas
    SET status = 'CONFIRMADA', resolvida_em = now(), resolvida_por = app_user_id(),
      evento_id = evento, updated_by = app_user_id(), updated_at = now()
    WHERE id = duvida;
  RETURN nova;
END $$;
--> statement-breakpoint

CREATE FUNCTION mentoria_descartar_duvida(duvida uuid, expected_version int) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE dono uuid; situacao text; nova int;
BEGIN
  PERFORM mentoria_exigir_acesso();
  SELECT pessoa_id, status INTO dono, situacao FROM mentoria_rdv_duvidas WHERE id = duvida;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
  nova := mentoria_travar_pessoa(dono, expected_version);
  IF situacao <> 'ABERTA' THEN
    RAISE EXCEPTION 'Esta dúvida já foi resolvida' USING ERRCODE = '22023';
  END IF;
  UPDATE mentoria_rdv_duvidas
    SET status = 'DESCARTADA', resolvida_em = now(), resolvida_por = app_user_id(),
      updated_by = app_user_id(), updated_at = now()
    WHERE id = duvida;
  RETURN nova;
END $$;
--> statement-breakpoint

-- Enfileira as chaves de mídia dos donos e apaga as linhas de mentoria_midia (regra 7).
CREATE FUNCTION mentoria_enfileirar_midia(tipos text[], donos uuid[]) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  WITH apagadas AS (
    DELETE FROM mentoria_midia m
    WHERE m.dono_tipo = ANY (tipos) AND m.dono_id = ANY (donos)
    RETURNING m.chave_objeto
  )
  INSERT INTO mentoria_midia_exclusao (chave_objeto)
    SELECT chave_objeto FROM apagadas WHERE chave_objeto IS NOT NULL;
END $$;
--> statement-breakpoint

-- Exclusão (regra 6, D11): sem desfazer. Enfileira a mídia do registro e dos filhos e apaga o
-- registro (filhos por ON DELETE CASCADE), tudo na mesma transação.
CREATE FUNCTION mentoria_excluir_registro(kind text, alvo uuid, expected_version int)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE pai uuid; atual int;
BEGIN
  PERFORM mentoria_exigir_acesso();
  CASE kind
  WHEN 'MENTORADO' THEN
    SELECT version INTO atual FROM mentoria_mentorados WHERE id = alvo FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
    IF atual <> expected_version THEN
      RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'P0409';
    END IF;
    DELETE FROM mentoria_mentorados WHERE id = alvo;
  WHEN 'FICHA' THEN
    PERFORM mentoria_travar_ficha(alvo, expected_version);
    PERFORM mentoria_enfileirar_midia(ARRAY['FICHA_ANTES', 'FICHA_DEPOIS'], ARRAY[alvo]);
    PERFORM mentoria_enfileirar_midia(ARRAY['CONQUISTA'],
      ARRAY(SELECT id FROM mentoria_conquistas WHERE ficha_id = alvo));
    DELETE FROM mentoria_fichas WHERE id = alvo;
  WHEN 'CONQUISTA' THEN
    SELECT ficha_id INTO pai FROM mentoria_conquistas WHERE id = alvo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
    PERFORM mentoria_travar_ficha(pai, expected_version);
    PERFORM mentoria_enfileirar_midia(ARRAY['CONQUISTA'], ARRAY[alvo]);
    DELETE FROM mentoria_conquistas WHERE id = alvo;
  WHEN 'RDV_PESSOA' THEN
    PERFORM mentoria_travar_pessoa(alvo, expected_version);
    PERFORM mentoria_enfileirar_midia(ARRAY['RDV_PESSOA'], ARRAY[alvo]);
    PERFORM mentoria_enfileirar_midia(ARRAY['RDV_EVENTO'],
      ARRAY(SELECT id FROM mentoria_rdv_eventos WHERE pessoa_id = alvo));
    PERFORM mentoria_enfileirar_midia(ARRAY['RDV_QUADRO_ITEM'],
      ARRAY(SELECT id FROM mentoria_rdv_quadros WHERE pessoa_id = alvo));
    DELETE FROM mentoria_rdv_pessoas WHERE id = alvo;
  WHEN 'RDV_EVENTO' THEN
    SELECT pessoa_id INTO pai FROM mentoria_rdv_eventos WHERE id = alvo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
    PERFORM mentoria_travar_pessoa(pai, expected_version);
    PERFORM mentoria_enfileirar_midia(ARRAY['RDV_EVENTO'], ARRAY[alvo]);
    DELETE FROM mentoria_rdv_eventos WHERE id = alvo;
  WHEN 'RDV_DUVIDA' THEN
    SELECT pessoa_id INTO pai FROM mentoria_rdv_duvidas WHERE id = alvo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
    PERFORM mentoria_travar_pessoa(pai, expected_version);
    DELETE FROM mentoria_rdv_duvidas WHERE id = alvo;
  WHEN 'RDV_QUADRO_ITEM' THEN
    SELECT pessoa_id INTO pai FROM mentoria_rdv_quadros WHERE id = alvo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
    PERFORM mentoria_travar_pessoa(pai, expected_version);
    PERFORM mentoria_enfileirar_midia(ARRAY['RDV_QUADRO_ITEM'], ARRAY[alvo]);
    DELETE FROM mentoria_rdv_quadros WHERE id = alvo;
  ELSE
    RAISE EXCEPTION 'Tipo de registro desconhecido' USING ERRCODE = '22023';
  END CASE;
END $$;
--> statement-breakpoint

-- "×" de foto ou vídeo anexado (exceção da regra 6): remove na hora, sem version.
CREATE FUNCTION mentoria_excluir_midia(midia uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE chave text;
BEGIN
  PERFORM mentoria_exigir_acesso();
  DELETE FROM mentoria_midia WHERE id = midia RETURNING chave_objeto INTO chave;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF chave IS NOT NULL THEN
    INSERT INTO mentoria_midia_exclusao (chave_objeto) VALUES (chave);
  END IF;
END $$;
--> statement-breakpoint

-- Worker de mídia (sem sessão de usuário): funções SECURITY INVOKER, que só o role
-- npac_media_worker executa e que só leem a fila com os privilégios desse role.
GRANT SELECT, UPDATE (removido_em) ON mentoria_midia_exclusao TO npac_media_worker;
--> statement-breakpoint
CREATE POLICY mentoria_midia_exclusao_worker ON mentoria_midia_exclusao FOR ALL
  TO npac_media_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE FUNCTION mentoria_midia_fila_pendente(limite int)
  RETURNS TABLE (id bigint, chave_objeto text)
  LANGUAGE plpgsql STABLE
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user <> 'npac_media_worker' THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT e.id, e.chave_objeto FROM mentoria_midia_exclusao e
    WHERE e.removido_em IS NULL ORDER BY e.id LIMIT limite;
END $$;
--> statement-breakpoint
CREATE FUNCTION mentoria_midia_marcar_removida(item bigint) RETURNS void
  LANGUAGE plpgsql VOLATILE
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user <> 'npac_media_worker' THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE mentoria_midia_exclusao SET removido_em = now() WHERE id = item;
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_exigir_acesso() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_travar_pessoa(uuid, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_travar_ficha(uuid, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_colar_diagnostico(uuid, int, jsonb) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_colar_link_pasta(uuid, int, text) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_confirmar_duvida(uuid, int, uuid, text, date, text, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_descartar_duvida(uuid, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_enfileirar_midia(text[], uuid[]) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_excluir_registro(text, uuid, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_excluir_midia(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_midia_fila_pendente(int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_midia_marcar_removida(bigint) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_exigir_acesso(), mentoria_travar_pessoa(uuid, int),
  mentoria_travar_ficha(uuid, int), mentoria_colar_diagnostico(uuid, int, jsonb),
  mentoria_colar_link_pasta(uuid, int, text),
  mentoria_confirmar_duvida(uuid, int, uuid, text, date, text, int),
  mentoria_descartar_duvida(uuid, int), mentoria_enfileirar_midia(text[], uuid[]),
  mentoria_excluir_registro(text, uuid, int), mentoria_excluir_midia(uuid),
  mentoria_midia_fila_pendente(int), mentoria_midia_marcar_removida(bigint) FROM PUBLIC;
--> statement-breakpoint
-- Internas (travar, enfileirar, exigir) não recebem EXECUTE: só as funções públicas as chamam.
GRANT EXECUTE ON FUNCTION mentoria_colar_diagnostico(uuid, int, jsonb),
  mentoria_colar_link_pasta(uuid, int, text),
  mentoria_confirmar_duvida(uuid, int, uuid, text, date, text, int),
  mentoria_descartar_duvida(uuid, int), mentoria_excluir_registro(text, uuid, int),
  mentoria_excluir_midia(uuid) TO npac_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_midia_fila_pendente(int), mentoria_midia_marcar_removida(bigint)
  TO npac_media_worker;
