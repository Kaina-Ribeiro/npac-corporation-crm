-- Exclusão, LGPD e transferência de carteira (§3, §9). Só Admin; tudo por função, nunca DELETE do
-- app. A mídia vai para a fila do worker, que apaga o arquivo do volume.

-- Mídia da inscrição: fotos das pessoas, foto da família e evidências das ações.
CREATE FUNCTION mentoria_enfileirar_midia(inscricao uuid) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  UPDATE mentoria_pessoas SET foto_midia_id = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_inscricoes SET foto_familia_midia_id = NULL WHERE id = inscricao;
  UPDATE mentoria_acoes SET evidencia_midia_id = NULL WHERE inscricao_id = inscricao;
  WITH m AS (
    DELETE FROM mentoria_midia x
    WHERE (x.dono_tipo = 'PESSOA_FOTO'
        AND x.dono_id IN (SELECT p.id FROM mentoria_pessoas p WHERE p.inscricao_id = inscricao))
      OR (x.dono_tipo = 'FOTO_FAMILIA' AND x.dono_id = inscricao)
      OR (x.dono_tipo = 'ACAO_EVIDENCIA'
        AND x.dono_id IN (SELECT a.id FROM mentoria_acoes a WHERE a.inscricao_id = inscricao))
    RETURNING x.chave_objeto
  )
  INSERT INTO mentoria_midia_exclusao (chave_objeto)
  SELECT m.chave_objeto FROM m WHERE m.chave_objeto IS NOT NULL;
$$;
--> statement-breakpoint

-- Inscrição duplicada ou cadastrada por engano (§6): some com tudo o que é dela. Sem desfazer.
CREATE FUNCTION mentoria_excluir_inscricao(inscricao uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT mentoria_admin() OR NOT EXISTS (SELECT 1 FROM mentoria_inscricoes WHERE id = inscricao) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM mentoria_inscricoes WHERE id = inscricao FOR UPDATE;
  PERFORM mentoria_enfileirar_midia(inscricao);
  DELETE FROM mentoria_inscricoes WHERE id = inscricao;
END $$;
--> statement-breakpoint

-- LGPD (§9): apaga o que é pessoal (nome, contato, endereço, momento inicial, avaliações, textos
-- cifrados, legado, anotações e mídia) e mantém a inscrição, as reuniões, as ações e o
-- histórico (só nomes de campos): as contagens continuam certas.
CREATE FUNCTION mentoria_anonimizar_inscricao(inscricao uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT mentoria_admin() OR NOT EXISTS (SELECT 1 FROM mentoria_inscricoes WHERE id = inscricao) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1 FROM mentoria_inscricoes WHERE id = inscricao FOR UPDATE;
  PERFORM mentoria_enfileirar_midia(inscricao);
  UPDATE mentoria_pessoas SET nome = 'Anonimizado', nome_norm = 'anonimizado', apelido = NULL,
    nascimento = NULL, cidade = NULL, uf = NULL, whatsapp = NULL, whatsapp_idx = NULL,
    email = NULL, email_idx = NULL, instagram = NULL, profissao = NULL, ocupacao = NULL,
    filhos_quantidade = NULL, filhos_idades = NULL, tecnologia = NULL, melhor_horario = NULL,
    canal_preferido = NULL, pulseira = NULL, version = version + 1, atualizado_em = now()
  WHERE inscricao_id = inscricao;
  DELETE FROM mentoria_avaliacoes
    WHERE pessoa_id IN (SELECT p.id FROM mentoria_pessoas p WHERE p.inscricao_id = inscricao);
  DELETE FROM mentoria_enderecos WHERE inscricao_id = inscricao;
  DELETE FROM mentoria_momento_inicial WHERE inscricao_id = inscricao;
  DELETE FROM mentoria_legado WHERE inscricao_id = inscricao;
  DELETE FROM mentoria_anotacoes WHERE inscricao_id = inscricao;
  UPDATE mentoria_reunioes SET resumo = NULL, metas = NULL, combinado = NULL, cobrar = NULL,
    trava = NULL, anotacao_interna = NULL, link = NULL, version = version + 1, atualizado_em = now()
  WHERE inscricao_id = inscricao;
  UPDATE mentoria_contatos SET motivo = NULL, observacao = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_pausas SET motivo = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_acoes SET observacao = NULL, evidencia_link = NULL, version = version + 1,
    atualizado_em = now()
  WHERE inscricao_id = inscricao;
  UPDATE mentoria_envios_fisicos SET rastreio = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_inscricoes SET link_pasta = NULL, link_grupo = NULL, importacao_chave = NULL,
    importacao_apelidos = '{}', completar_campos = '{}', version = version + 1,
    atualizado_em = now()
  WHERE id = inscricao;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.anonimizada', ARRAY['pessoas', 'contato',
      'endereco', 'momento', 'anotacoes', 'midia']);
END $$;
--> statement-breakpoint

-- Transferir carteira (§5): as inscrições em andamento de uma pessoa passam para outra do
-- Acompanhamento; as ações pendentes vão junto (gatilho da 0050 e as atribuídas a ela).
CREATE FUNCTION mentoria_transferir_carteira(de text, para text)
  RETURNS TABLE (inscricoes int, acoes int)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE n_insc int; n_acoes int;
BEGIN
  IF NOT mentoria_admin() THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF de = para THEN
    RAISE EXCEPTION 'Escolha outra pessoa para receber a carteira' USING ERRCODE = '22023';
  END IF;
  IF mentoria_perfil_de(para) IS DISTINCT FROM 'ACOMPANHAMENTO' THEN
    RAISE EXCEPTION 'Quem recebe precisa ter o perfil Acompanhamento' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::int INTO n_acoes FROM mentoria_acoes a
    WHERE a.responsavel_id = de AND a.status = 'PENDENTE';
  WITH t AS (
    UPDATE mentoria_inscricoes SET responsavel_id = para, version = version + 1,
      atualizado_em = now()
    WHERE responsavel_id = de AND status IN ('ONBOARDING', 'ATIVO', 'PAUSADO')
    RETURNING id
  ), h AS (
    INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    SELECT t.id, app_user_id(), 'inscricao.transferida', ARRAY['responsavelId'] FROM t
    RETURNING 1
  )
  SELECT count(*)::int INTO n_insc FROM h;
  -- As pendentes que eram dela em outras inscrições também vão (o gatilho cobre as da carteira).
  UPDATE mentoria_acoes SET responsavel_id = para
    WHERE responsavel_id = de AND status = 'PENDENTE';
  RETURN QUERY SELECT n_insc, n_acoes;
END $$;
--> statement-breakpoint
ALTER FUNCTION mentoria_enfileirar_midia(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_excluir_inscricao(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_anonimizar_inscricao(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_transferir_carteira(text, text) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_enfileirar_midia(uuid), mentoria_excluir_inscricao(uuid),
  mentoria_anonimizar_inscricao(uuid), mentoria_transferir_carteira(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_excluir_inscricao(uuid), mentoria_anonimizar_inscricao(uuid),
  mentoria_transferir_carteira(text, text) TO npac_app;
