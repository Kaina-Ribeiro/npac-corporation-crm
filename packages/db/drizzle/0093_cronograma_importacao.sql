-- NPAC-60, fase 3: importação única da planilha do cronograma (desenho §8, C8, C13).
-- O que veio da planilha e não virou tarefa entra em mentoria_cronograma_anteriores só por esta função (o
-- npac_app só lê a tabela). Só a Admin (mentoria_admin(): Diretoria ou selo de Admin do módulo) importa; só
-- acrescenta (linha já existente da mesma inscrição e item fica como está) e devolve quantas linhas entraram.
CREATE FUNCTION mentoria_cronograma_importar(inscricao uuid, itens uuid[], numeros smallint[],
    resultados text[]) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  n int;
BEGIN
  IF NOT coalesce(mentoria_admin(), false) THEN
    RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM mentoria_inscricoes i WHERE i.id = inscricao) THEN
    RAISE EXCEPTION 'Inscrição não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF cardinality(itens) <> cardinality(numeros) OR cardinality(itens) <> cardinality(resultados) THEN
    RAISE EXCEPTION 'Listas de tamanhos diferentes' USING ERRCODE = '22023';
  END IF;
  INSERT INTO mentoria_cronograma_anteriores (inscricao_id, item_id, pme_numero, resultado, importado_por)
  SELECT inscricao, x.item, x.numero, x.resultado, app_user_id()
  FROM unnest(itens, numeros, resultados) AS x(item, numero, resultado)
  ON CONFLICT (inscricao_id, item_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
--> statement-breakpoint
ALTER FUNCTION mentoria_cronograma_importar(uuid, uuid[], smallint[], text[]) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_cronograma_importar(uuid, uuid[], smallint[], text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_cronograma_importar(uuid, uuid[], smallint[], text[]) TO npac_app;
