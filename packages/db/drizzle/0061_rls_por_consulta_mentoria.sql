-- Desempenho, Fase 1 (docs/plans/desempenho.md, T1.4): as políticas de leitura do Acompanhamento
-- deixam de chamar mentoria_ve()/mentoria_admin()/mentoria_perfil() linha a linha. Quem vê tudo
-- (Admin, Acompanhamento, Operação) e a lista de inscrições da Especialista são calculados uma vez
-- por consulta (`(select …)` vira um InitPlan). Mesma semântica de antes; mentoria_ve e as funções
-- mentoria_edita* continuam existindo e as políticas de INSERT/UPDATE não mudam (uma linha por vez).
-- mentoria_midia_leitura também fica (mídia é lida uma linha por vez, pelo id).

-- Admin, Acompanhamento e Operação: o caso de mentoria_ve que não depende da inscrição.
CREATE FUNCTION mentoria_ve_todas() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO'), false)
$$;
--> statement-breakpoint

-- Especialista: as inscrições com reunião conduzida por ela (o caso ESPECIALISTA de mentoria_ve).
-- Qualquer outro perfil, ou sem perfil, recebe a lista vazia.
CREATE FUNCTION mentoria_ids_especialista() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN mentoria_perfil() = 'ESPECIALISTA' THEN coalesce(
    (SELECT array_agg(DISTINCT r.inscricao_id) FROM mentoria_reunioes r
      WHERE r.conduzida_por = (SELECT app_user_id())),
    '{}'::uuid[]) ELSE '{}'::uuid[] END
$$;
--> statement-breakpoint
ALTER FUNCTION mentoria_ve_todas() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_ids_especialista() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_ve_todas(), mentoria_ids_especialista() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_ve_todas(), mentoria_ids_especialista() TO npac_app;
--> statement-breakpoint

-- Antes: mentoria_ve(id) / mentoria_ve(inscricao_id).
ALTER POLICY mentoria_inscricoes_leitura ON mentoria_inscricoes USING (
  (SELECT mentoria_ve_todas()) OR id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_pessoas_leitura ON mentoria_pessoas USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_acoes_leitura ON mentoria_acoes USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_anotacoes_leitura ON mentoria_anotacoes USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_contatos_leitura ON mentoria_contatos USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_enderecos_leitura ON mentoria_enderecos USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_envios_leitura ON mentoria_envios_fisicos USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_historico_leitura ON mentoria_historico USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_momento_leitura ON mentoria_momento_inicial USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_etapas_leitura ON mentoria_onboarding_etapas USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_pausas_leitura ON mentoria_pausas USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_ciclos_leitura ON mentoria_ciclos USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])
);
--> statement-breakpoint

-- Antes: EXISTS pessoa com mentoria_ve(p.inscricao_id).
ALTER POLICY mentoria_avaliacoes_leitura ON mentoria_avaliacoes USING (
  EXISTS (SELECT 1 FROM mentoria_pessoas p
    WHERE p.id = mentoria_avaliacoes.pessoa_id
      AND ((SELECT mentoria_ve_todas())
        OR p.inscricao_id = ANY ((SELECT mentoria_ids_especialista())::uuid[])))
);
--> statement-breakpoint

-- Antes: mentoria_ve_reuniao(conduzida_por, inscricao_id).
ALTER POLICY mentoria_reunioes_leitura ON mentoria_reunioes USING (
  (SELECT mentoria_ve_todas())
  OR ((SELECT mentoria_perfil()) = 'ESPECIALISTA' AND conduzida_por = (SELECT app_user_id()))
);
--> statement-breakpoint

-- Antes: mentoria_ve_tarefa(reuniao_id, inscricao_id). A Especialista lê a tarefa de reunião
-- conduzida por ela, da mesma inscrição (busca pela chave da reunião).
ALTER POLICY mentoria_tarefas_leitura ON mentoria_tarefas USING (
  (SELECT mentoria_ve_todas())
  OR ((SELECT mentoria_perfil()) = 'ESPECIALISTA' AND reuniao_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM mentoria_reunioes r
    WHERE r.id = mentoria_tarefas.reuniao_id AND r.inscricao_id = mentoria_tarefas.inscricao_id
      AND r.conduzida_por = (SELECT app_user_id())))
);
--> statement-breakpoint

-- Antes: mentoria_ve_meta(inscricao_id) = mentoria_ve(inscricao_id) AND (Admin, Acompanhamento ou
-- Operação). Para esses três mentoria_ve é sempre verdadeiro: sobra mentoria_ve_todas().
ALTER POLICY mentoria_metas_leitura ON mentoria_metas USING (
  (SELECT mentoria_ve_todas())
);
--> statement-breakpoint

-- Antes: mentoria_admin() / mentoria_perfil() soltos, avaliados por linha.
ALTER POLICY mentoria_legado_admin ON mentoria_legado
  USING ((SELECT mentoria_admin()))
  WITH CHECK ((SELECT mentoria_admin()));
--> statement-breakpoint
ALTER POLICY mentoria_fila_feitos_leitura ON mentoria_fila_feitos USING (
  (SELECT mentoria_admin())
  OR (SELECT mentoria_perfil()) = ANY (ARRAY['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'])
);
--> statement-breakpoint
ALTER POLICY mentoria_mensagens_leitura ON mentoria_mensagens_modelo USING (
  (SELECT mentoria_admin())
  OR (SELECT mentoria_perfil()) = ANY (ARRAY['ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'])
);
--> statement-breakpoint
ALTER POLICY mentoria_perfis_leitura ON mentoria_perfis USING (
  (SELECT mentoria_admin()) OR user_id = (SELECT app_user_id())
);
--> statement-breakpoint
ALTER POLICY mentoria_plano_leitura ON mentoria_plano_modelo USING (
  (SELECT mentoria_admin())
  OR coalesce((SELECT mentoria_perfil()) IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'), false)
);
--> statement-breakpoint
ALTER POLICY mentoria_pmes_leitura ON mentoria_pmes USING (
  (SELECT mentoria_admin())
  OR coalesce((SELECT mentoria_perfil()) IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'), false)
);
