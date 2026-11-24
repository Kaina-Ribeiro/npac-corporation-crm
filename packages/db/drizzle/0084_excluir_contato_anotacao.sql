-- NPAC-70 (Duda, 24/11/2026, "1A, 2C"): a Admin do Acompanhamento (e a Diretoria) exclui contato e anotação do
-- Histórico da ficha. As tabelas seguem só acréscimo para o npac_app (sem DELETE): a exclusão é só por estas
-- funções, que conferem a Admin no banco. O histórico grava o tipo e quem excluiu, nunca o texto.
-- Sem a linha: 404 (P0002). Vê a inscrição mas não é Admin: 42501 (a API responde 404, como no resto do módulo).
CREATE FUNCTION mentoria_contato_excluir(contato uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE insc uuid;
BEGIN
  SELECT c.inscricao_id INTO insc FROM mentoria_contatos c WHERE c.id = contato FOR UPDATE;
  IF NOT FOUND OR NOT mentoria_ve(insc) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT mentoria_admin() THEN
    RAISE EXCEPTION 'Só a Admin exclui contatos' USING ERRCODE = '42501';
  END IF;
  DELETE FROM mentoria_contatos c WHERE c.id = contato;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (insc, app_user_id(), 'contato.excluido', '{}');
END $$;
--> statement-breakpoint
CREATE FUNCTION mentoria_anotacao_excluir(anotacao uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE insc uuid;
BEGIN
  SELECT a.inscricao_id INTO insc FROM mentoria_anotacoes a WHERE a.id = anotacao FOR UPDATE;
  IF NOT FOUND OR NOT mentoria_ve(insc) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT mentoria_admin() THEN
    RAISE EXCEPTION 'Só a Admin exclui anotações' USING ERRCODE = '42501';
  END IF;
  DELETE FROM mentoria_anotacoes a WHERE a.id = anotacao;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (insc, app_user_id(), 'anotacao.excluida', '{}');
END $$;
--> statement-breakpoint
ALTER FUNCTION mentoria_contato_excluir(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_anotacao_excluir(uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_contato_excluir(uuid), mentoria_anotacao_excluir(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_contato_excluir(uuid), mentoria_anotacao_excluir(uuid) TO npac_app;
