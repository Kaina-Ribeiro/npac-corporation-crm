-- NPAC-54, Fase 3B: alcance "só a carteira" no cargo Acompanhamento (spec 2026-11-19-acesso-por-area-design,
-- "Fase 3B"). Quem tem alcance CARTEIRA vê e edita só as inscrições em que é responsável; TODOS = como antes.
-- Visibilidade só por RLS e pelas funções do módulo; listas calculadas uma vez por consulta (0061).
ALTER TABLE "area_membros" ADD COLUMN "alcance" text DEFAULT 'TODOS' NOT NULL;--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_alcance" CHECK ("area_membros"."alcance" = 'TODOS' or ("area_membros"."alcance" = 'CARTEIRA' and "area_membros"."area" = 'ACOMPANHAMENTO'
        and "area_membros"."cargo" = 'ACOMPANHAMENTO' and not "area_membros"."head"));--> statement-breakpoint

-- ------------------------------------------------------------------ o alcance só vale no cargo Acompanhamento
-- Trocar o cargo (por qualquer caminho: área, perfil, user.role de compatibilidade) ou dar o selo de Admin volta o
-- alcance a TODOS, para o CHECK area_membros_alcance continuar valendo.
CREATE FUNCTION area_membros_alcance() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.area <> 'ACOMPANHAMENTO' OR NEW.cargo IS DISTINCT FROM 'ACOMPANHAMENTO' OR NEW.head THEN
    NEW.alcance := 'TODOS';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER area_membros_alcance BEFORE INSERT OR UPDATE ON area_membros
  FOR EACH ROW EXECUTE FUNCTION area_membros_alcance();
--> statement-breakpoint

-- ------------------------------------------------------------------ gravação do alcance
-- Versão nova com o alcance; nulo = mantém o que a pessoa tem (TODOS em vínculo novo). A regra é a da troca de
-- cargo (CARGO): Diretoria e Head da área, nunca o próprio, nunca em outro Head.
CREATE FUNCTION area_definir_membro(alvo text, nova_area text, novo_cargo text, novo_head boolean,
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
      AND novo_cargo NOT IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR') THEN
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
-- A de 4 argumentos (versão anterior do app, mentoria_definir_perfil) mantém o alcance.
CREATE OR REPLACE FUNCTION area_definir_membro(alvo text, nova_area text, novo_cargo text,
  novo_head boolean)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT area_definir_membro(alvo, nova_area, novo_cargo, novo_head, NULL::text)
$$;
--> statement-breakpoint
-- A API lê o alcance junto do cargo (lista de contas, /api/me).
CREATE OR REPLACE FUNCTION area_conta_json(uid text) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('mestre', u.mestre, 'areas', coalesce(
    (SELECT jsonb_agg(jsonb_build_object('area', m.area, 'cargo', m.cargo, 'head', m.head,
        'alcance', m.alcance)
      ORDER BY m.area) FROM area_membros m WHERE m.user_id = u.id), '[]'::jsonb))
  FROM "user" u WHERE u.id = uid
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ quem está logado e a carteira dele
-- Alcance "só a carteira" de quem está logado (conta ativa, cargo Acompanhamento, sem selo).
CREATE FUNCTION mentoria_so_carteira() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM area_membros m JOIN "user" u ON u.id = m.user_id
    WHERE m.user_id = app_user_id() AND u.active AND NOT u.mestre AND m.area = 'ACOMPANHAMENTO'
      AND m.cargo = 'ACOMPANHAMENTO' AND m.alcance = 'CARTEIRA' AND NOT m.head)
$$;
--> statement-breakpoint
-- As inscrições da carteira de quem tem "só a carteira"; vazia para os demais. Uma vez por consulta.
CREATE FUNCTION mentoria_ids_carteira() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN mentoria_so_carteira() THEN coalesce(
    (SELECT array_agg(i.id) FROM mentoria_inscricoes i WHERE i.responsavel_id = app_user_id()),
    '{}'::uuid[]) ELSE '{}'::uuid[] END
$$;
--> statement-breakpoint
-- Por linha: verdadeiro para quem não tem "só a carteira"; para quem tem, só na carteira.
CREATE FUNCTION mentoria_carteira_ok(inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT NOT mentoria_so_carteira() OR EXISTS (
    SELECT 1 FROM mentoria_inscricoes i WHERE i.id = inscricao AND i.responsavel_id = app_user_id())
$$;
--> statement-breakpoint
-- A lista das políticas de leitura (0061): as inscrições da Especialista e as da carteira.
CREATE FUNCTION mentoria_ids_visiveis() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_ids_especialista() || mentoria_ids_carteira()
$$;
--> statement-breakpoint
-- "Vê tudo" deixa de valer para quem tem "só a carteira".
CREATE OR REPLACE FUNCTION mentoria_ve_todas() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(mentoria_perfil() = 'OPERACAO', false)
    OR (coalesce(mentoria_perfil() = 'ACOMPANHAMENTO', false) AND NOT mentoria_so_carteira())
$$;
--> statement-breakpoint
ALTER FUNCTION area_membros_alcance() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION area_definir_membro(text, text, text, boolean, text) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_so_carteira() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_ids_carteira() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_carteira_ok(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_ids_visiveis() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION area_membros_alcance(), area_definir_membro(text, text, text, boolean, text),
  mentoria_so_carteira(), mentoria_ids_carteira(), mentoria_carteira_ok(uuid), mentoria_ids_visiveis()
  FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION area_definir_membro(text, text, text, boolean, text), mentoria_so_carteira(),
  mentoria_ids_carteira(), mentoria_carteira_ok(uuid), mentoria_ids_visiveis() TO npac_app;
--> statement-breakpoint

-- ------------------------------------------------------------------ funções por linha
-- No cargo Acompanhamento, "e (não é só a carteira ou a inscrição está na carteira)".
CREATE OR REPLACE FUNCTION mentoria_ve(inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN mentoria_carteira_ok(inscricao)
      WHEN 'OPERACAO' THEN true
      WHEN 'ESPECIALISTA' THEN EXISTS (
        SELECT 1 FROM mentoria_reunioes r
        WHERE r.inscricao_id = inscricao AND r.conduzida_por = app_user_id())
      ELSE false
    END, false)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO',
        'CONTATO', 'ANOTACAO', 'PME', 'TAREFA', 'META', 'CHECKIN', 'SEGUNDA_CHANCE')
        AND mentoria_carteira_ok(inscricao)
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO', 'PME')
      WHEN 'ESPECIALISTA' THEN area IN ('ANOTACAO', 'REUNIAO') AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_ve_reuniao(condutor text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN mentoria_carteira_ok(inscricao)
      WHEN 'OPERACAO' THEN true
      WHEN 'ESPECIALISTA' THEN condutor = app_user_id()
      ELSE false
    END, false)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_edita_reuniao(condutor text, tipo text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN mentoria_carteira_ok(inscricao)
      WHEN 'OPERACAO' THEN true
      WHEN 'ESPECIALISTA' THEN condutor = app_user_id() AND tipo <> 'IDR' AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_ve_tarefa(reuniao uuid, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN mentoria_carteira_ok(inscricao)
      WHEN 'OPERACAO' THEN true
      WHEN 'ESPECIALISTA' THEN reuniao IS NOT NULL AND EXISTS (
        SELECT 1 FROM mentoria_reunioes r
        WHERE r.id = reuniao AND r.inscricao_id = inscricao AND r.conduzida_por = app_user_id())
      ELSE false
    END, false)
$$;
--> statement-breakpoint
-- Semáforo de uma inscrição e o da Fila: também os da carteira.
CREATE OR REPLACE FUNCTION mentoria_semaforo(inscricao uuid, dia date)
  RETURNS TABLE(cor text, motivos text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.cor, s.motivos FROM mentoria_semaforo_calc(inscricao, dia) s
  WHERE mentoria_ve_todas() OR inscricao = ANY (mentoria_ids_carteira())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_semaforo_lote(dia date)
  RETURNS TABLE(inscricao_id uuid, cor text, motivos text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.inscricao_id, s.cor, s.motivos FROM mentoria_semaforo_lote_calc(dia) s
  WHERE (SELECT mentoria_ve_todas()) OR s.inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
$$;
--> statement-breakpoint
-- "A todos do perfil": sem quem tem "só a carteira" (o item com responsável continua indo a ela).
CREATE OR REPLACE FUNCTION mentoria_destinatarios(alvo_perfil text, alvo text) RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN alvo IS NOT NULL AND mentoria_perfil_de(alvo) = alvo_perfil THEN ARRAY[alvo]
    ELSE coalesce((SELECT array_agg(u.id ORDER BY u.id) FROM "user" u
      JOIN area_membros m ON m.user_id = u.id AND m.area = 'ACOMPANHAMENTO'
      WHERE u.active AND m.cargo = alvo_perfil AND m.alcance = 'TODOS'), '{}')
  END
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ políticas
-- Inscrição: quem tem "só a carteira" cria só com ele de responsável (2A) e não troca o responsável (e).
-- Na conferência do UPDATE, mentoria_edita lê a linha de antes (a dele); a coluna nova vem de NEW.
ALTER POLICY mentoria_inscricoes_criar ON mentoria_inscricoes WITH CHECK (
  CASE WHEN mentoria_so_carteira() THEN responsavel_id = app_user_id()
    ELSE mentoria_edita('INSCRICAO', id) END
);
--> statement-breakpoint
ALTER POLICY mentoria_inscricoes_editar ON mentoria_inscricoes
  USING (mentoria_edita('INSCRICAO', id))
  WITH CHECK (mentoria_edita('INSCRICAO', id)
    AND (NOT mentoria_so_carteira() OR responsavel_id = app_user_id()));
--> statement-breakpoint
ALTER POLICY mentoria_reunioes_leitura ON mentoria_reunioes USING (
  (SELECT mentoria_ve_todas())
  OR ((SELECT mentoria_perfil()) = 'ESPECIALISTA' AND conduzida_por = (SELECT app_user_id()))
  OR inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_tarefas_leitura ON mentoria_tarefas USING (
  (SELECT mentoria_ve_todas())
  OR ((SELECT mentoria_perfil()) = 'ESPECIALISTA' AND reuniao_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM mentoria_reunioes r
    WHERE r.id = mentoria_tarefas.reuniao_id AND r.inscricao_id = mentoria_tarefas.inscricao_id
      AND r.conduzida_por = (SELECT app_user_id())))
  OR inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_metas_leitura ON mentoria_metas USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_checkins_leitura ON mentoria_checkins USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
);
--> statement-breakpoint
ALTER POLICY mentoria_semaforo_historico_leitura ON mentoria_semaforo_historico USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
);
--> statement-breakpoint
-- As 13 políticas que liam a lista da Especialista passam à lista das duas (mesma forma, 0061).
ALTER POLICY mentoria_acoes_leitura ON mentoria_acoes USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_anotacoes_leitura ON mentoria_anotacoes USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_avaliacoes_leitura ON mentoria_avaliacoes USING (
  (EXISTS ( SELECT 1
   FROM mentoria_pessoas p
  WHERE ((p.id = mentoria_avaliacoes.pessoa_id) AND (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (p.inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[]))))))
);
--> statement-breakpoint
ALTER POLICY mentoria_ciclos_leitura ON mentoria_ciclos USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_contatos_leitura ON mentoria_contatos USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_enderecos_leitura ON mentoria_enderecos USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_envios_leitura ON mentoria_envios_fisicos USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_historico_leitura ON mentoria_historico USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_inscricoes_leitura ON mentoria_inscricoes USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_momento_leitura ON mentoria_momento_inicial USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_etapas_leitura ON mentoria_onboarding_etapas USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_pausas_leitura ON mentoria_pausas USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint
ALTER POLICY mentoria_pessoas_leitura ON mentoria_pessoas USING (
  (( SELECT mentoria_ve_todas() AS mentoria_ve_todas) OR (inscricao_id = ANY (( SELECT mentoria_ids_visiveis() AS mentoria_ids_visiveis)::uuid[])))
);
--> statement-breakpoint

-- ------------------------------------------------------------------ ações com SECURITY DEFINER
-- Pausar, retomar, excluir reunião e a sequência de check-ins liam a linha sem a RLS: passam a recortar.
CREATE OR REPLACE FUNCTION public.mentoria_pausar(inscricao uuid, pausa uuid, motivo_cifrado text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE atual text; nova int;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (mentoria_admin() OR coalesce(mentoria_perfil() = 'ACOMPANHAMENTO', false)) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO atual FROM mentoria_inscricoes
    WHERE id = inscricao AND mentoria_carteira_ok(inscricao) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF atual = 'PAUSADO' THEN
    RAISE EXCEPTION 'Esta inscrição já está pausada' USING ERRCODE = '23505';
  END IF;
  IF atual NOT IN ('ONBOARDING', 'ATIVO') THEN
    RAISE EXCEPTION 'Só inscrição em onboarding ou ativa pode ser pausada' USING ERRCODE = '22023';
  END IF;
  INSERT INTO mentoria_pausas (id, inscricao_id, inicio, status_anterior, motivo, pausada_por)
    VALUES (pausa, inscricao, hoje, atual, motivo_cifrado, app_user_id());
  UPDATE mentoria_inscricoes SET status = 'PAUSADO', version = version + 1, atualizado_em = now()
    WHERE id = inscricao RETURNING version INTO nova;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.pausada', ARRAY['status']);
  RETURN nova;
END $function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mentoria_retomar(inscricao uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE i record; p record; dias int; de date; nova int;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (mentoria_admin() OR coalesce(mentoria_perfil() = 'ACOMPANHAMENTO', false)) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO i FROM mentoria_inscricoes
    WHERE id = inscricao AND mentoria_carteira_ok(inscricao) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO p FROM mentoria_pausas WHERE inscricao_id = inscricao AND fim IS NULL FOR UPDATE;
  IF NOT FOUND OR i.status <> 'PAUSADO' THEN
    RAISE EXCEPTION 'Esta inscrição não está pausada' USING ERRCODE = '22023';
  END IF;
  de := greatest(p.inicio, coalesce(i.inicio_jornada, p.inicio));
  dias := greatest(hoje - de, 0);
  UPDATE mentoria_pausas SET fim = greatest(hoje, inicio), retomada_por = app_user_id()
    WHERE id = p.id;
  UPDATE mentoria_inscricoes SET
    status = p.status_anterior,
    termino_previsto = termino_previsto + dias,
    version = version + 1,
    atualizado_em = now()
    WHERE id = inscricao RETURNING version INTO nova;
  IF dias > 0 THEN
    UPDATE mentoria_acoes SET
      data_prevista = CASE WHEN data_prevista >= de THEN data_prevista + dias ELSE data_prevista END,
      data_limite = data_limite + dias,
      version = version + 1,
      atualizado_em = now()
    WHERE inscricao_id = inscricao AND status = 'PENDENTE' AND NOT anterior_ao_sistema
      AND data_limite >= de;
  END IF;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.retomada',
      ARRAY['status', 'terminoPrevisto', 'acoes']);
  RETURN nova;
END $function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mentoria_excluir_reuniao(reuniao uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM mentoria_reunioes
    WHERE id = reuniao AND mentoria_carteira_ok(inscricao_id) FOR UPDATE;
  IF NOT FOUND OR NOT (mentoria_admin()
      OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO'), false)) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'AGENDADA' OR num_nonnulls(r.resumo, r.metas, r.combinado, r.cobrar, r.trava,
      r.anotacao_interna, r.humor, r.interesse_renovar) > 0
      OR EXISTS (SELECT 1 FROM mentoria_tarefas t WHERE t.reuniao_id = reuniao)
      OR EXISTS (SELECT 1 FROM mentoria_metas m WHERE m.reuniao_id = reuniao) THEN
    RAISE EXCEPTION 'Só reunião agendada e sem registro pode ser excluída' USING ERRCODE = '22023';
  END IF;
  UPDATE mentoria_reunioes SET remarcada_para_id = NULL WHERE remarcada_para_id = reuniao;
  DELETE FROM mentoria_reunioes WHERE id = reuniao;
  IF r.tipo = 'IDR' THEN PERFORM mentoria_sincronizar_idr(r.inscricao_id); END IF;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (r.inscricao_id, app_user_id(), 'reuniao.excluida', ARRAY[r.tipo]);
END $function$

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.mentoria_sequencia_checkins(inscricao uuid, dia date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w date := date_trunc('week', dia::timestamp)::date - 7;
  n int := 0;
BEGIN
  IF NOT (mentoria_ve_todas() OR inscricao = ANY (mentoria_ids_carteira())) THEN RETURN NULL; END IF;
  WHILE n < 520 AND EXISTS (SELECT 1 FROM mentoria_checkins c
      WHERE c.inscricao_id = inscricao AND c.semana = w AND c.respondeu) LOOP
    n := n + 1;
    w := w - 7;
  END LOOP;
  RETURN n;
END $function$

--> statement-breakpoint

-- Push da Fila: "a todos do perfil" sem quem tem "só a carteira".
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
  )
  SELECT av.k, av.q, av.fim, av.u FROM av
  WHERE cardinality(av.u) > 0
    AND NOT EXISTS (SELECT 1 FROM mentoria_avisos_enviados s WHERE s.chave = av.k)
$function$;
