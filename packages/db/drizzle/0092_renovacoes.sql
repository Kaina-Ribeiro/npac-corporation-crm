CREATE TABLE "mentoria_renovacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"ano" smallint NOT NULL,
	"data" date NOT NULL,
	"mentoria_anterior" text NOT NULL,
	"mentoria_nova" text NOT NULL,
	"termino_anterior" date NOT NULL,
	"termino_novo" date NOT NULL,
	"status_anterior" text NOT NULL,
	"concluida_em_anterior" timestamp with time zone,
	"acoes" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"registrada_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_renovacoes_ano" UNIQUE("inscricao_id","ano"),
	CONSTRAINT "mentoria_renovacoes_ano_valido" CHECK ("mentoria_renovacoes"."ano" >= 2),
	CONSTRAINT "mentoria_renovacoes_anterior" CHECK ("mentoria_renovacoes"."mentoria_anterior" in ('RDV', '2M', '6M')),
	CONSTRAINT "mentoria_renovacoes_nova" CHECK ("mentoria_renovacoes"."mentoria_nova" in ('RDV', '2M', '6M')),
	CONSTRAINT "mentoria_renovacoes_termino" CHECK ("mentoria_renovacoes"."termino_novo" > "mentoria_renovacoes"."termino_anterior"),
	CONSTRAINT "mentoria_renovacoes_status" CHECK ("mentoria_renovacoes"."status_anterior" in ('ATIVO', 'CONCLUIDO'))
);
--> statement-breakpoint
ALTER TABLE "mentoria_inscricoes" ADD COLUMN "concluida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mentoria_renovacoes" ADD CONSTRAINT "mentoria_renovacoes_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_renovacoes" ADD CONSTRAINT "mentoria_renovacoes_registrada_por_user_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_renovacoes_data" ON "mentoria_renovacoes" USING btree ("data");
--> statement-breakpoint

-- NPAC-79, Parte 1 (spec docs/superpowers/specs/2026-11-26-renovacoes-design.md; Duda 1A, 2C, 3B, 4B, 5A, 6A, 7A, 8A;
-- Gabriel G1–G6): a renovação fica na mesma ficha. O término anda 12 meses (G3), a mentoria pode trocar (2C), a ficha
-- continua ATIVO (G1; CONCLUIDO volta a ATIVO) e as ações do novo ano saem do plano-modelo da mentoria escolhida.
-- Fila, semáforo, check-ins, PMEs, envios e push seguem tratando só ATIVO: nada muda neles.

-- ------------------------------------------------------------------ quem vê e quem faz
-- A aba Renovações (7A): Admin (e Diretoria) e Acompanhamento; "só a carteira" pela RLS das inscrições.
CREATE FUNCTION mentoria_ve_renovacoes() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(mentoria_perfil() = 'ACOMPANHAMENTO', false)
$$;
--> statement-breakpoint
-- Área nova RENOVACAO no perfil Acompanhamento, com o recorte da carteira (o resto igual à 0087).
CREATE OR REPLACE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO',
        'CONTATO', 'ANOTACAO', 'PME', 'TAREFA', 'META', 'CHECKIN', 'SEGUNDA_CHANCE', 'EVOLUCAO', 'ENGAJAMENTO',
        'RENOVACAO')
        AND mentoria_carteira_ok(inscricao)
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO', 'PME')
      WHEN 'ESPECIALISTA' THEN area IN ('ANOTACAO', 'REUNIAO') AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ status
-- G2: RENOVADO deixa de ser escolha manual (quem já está fica). G4: CONCLUIDO ganha a data em que foi marcado, para
-- o número "Não renovaram"; sai ao voltar a outro status. Ficha que já nasce concluída (importação) fica sem data.
-- O dono do banco (seed, fixtures e as funções SECURITY DEFINER) grava o que quiser.
CREATE FUNCTION mentoria_inscricao_status_regras() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF NEW.status = 'RENOVADO' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'RENOVADO') THEN
    RAISE EXCEPTION 'Para renovar, use Registrar renovação.' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.concluida_em := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.concluida_em := CASE WHEN NEW.status = 'CONCLUIDO' THEN now() END;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_inscricao_status_regras BEFORE INSERT OR UPDATE OF status ON mentoria_inscricoes
  FOR EACH ROW EXECUTE FUNCTION mentoria_inscricao_status_regras();
--> statement-breakpoint

-- ------------------------------------------------------------------ ações do plano
-- O gerador ganha o corte "a partir do mês": sem ele, renovar RDV → 2M criaria os meses 1 a 12 da 2M, todos
-- atrasados. Interna (sem GRANT ao npac_app): quem chama confere o acesso. Devolve as ações criadas.
CREATE FUNCTION mentoria_gerar_acoes_desde(inscricao uuid, hoje date, desde_mes int) RETURNS uuid[]
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE i record; criadas uuid[];
BEGIN
  SELECT * INTO i FROM mentoria_inscricoes WHERE id = inscricao;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF i.inicio_jornada IS NULL THEN RETURN '{}'::uuid[]; END IF;
  WITH novas AS (
    INSERT INTO mentoria_acoes (inscricao_id, plano_modelo_id, mes, reuniao_tipo, foco, acao, itens,
      gatilho, dias_para_executar, data_prevista, data_limite, responsavel_perfil, responsavel_id,
      anterior_ao_sistema)
    SELECT inscricao, m.id, m.mes, m.reuniao_tipo, m.foco, m.acao, m.itens, m.gatilho,
      m.dias_para_executar, c.prevista, c.limite, m.responsavel_perfil,
      CASE WHEN m.responsavel_perfil = 'ACOMPANHAMENTO' THEN i.responsavel_id END,
      i.importada AND c.prevista < hoje
    FROM mentoria_plano_modelo m
    CROSS JOIN LATERAL (
      SELECT mentoria_data_ajustada(inscricao, i.inicio_jornada,
          mentoria_data_prevista(i.inicio_jornada, m.mes, m.dias_para_executar)) AS prevista,
        mentoria_data_ajustada(inscricao, i.inicio_jornada,
          CASE WHEN m.gatilho = 'FLEXIVEL'
            THEN mentoria_data_prevista(i.inicio_jornada, m.mes + 1, 0) - 1
            ELSE mentoria_data_prevista(i.inicio_jornada, m.mes, m.dias_para_executar) END) AS limite
    ) c
    WHERE m.mentoria = i.mentoria AND m.ativo AND m.mes >= desde_mes
      AND (i.termino_previsto IS NULL OR c.prevista <= i.termino_previsto)
    ON CONFLICT ON CONSTRAINT mentoria_acoes_modelo_unica DO NOTHING
    RETURNING mentoria_acoes.id
  )
  SELECT coalesce(array_agg(novas.id), '{}'::uuid[]) INTO criadas FROM novas;
  RETURN criadas;
END $$;
--> statement-breakpoint
-- Os chamadores de sempre (fechar o onboarding, corrigir o início, trocar o plano) geram a partir do ano atual da
-- jornada: em ficha renovada, trocar a mentoria pela inscrição não cria os meses dos anos que já passaram.
CREATE OR REPLACE FUNCTION mentoria_gerar_acoes(inscricao uuid, hoje date) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT pg_has_role(session_user, 'npac_owner', 'MEMBER') AND NOT mentoria_edita('INSCRICAO', inscricao) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN cardinality(mentoria_gerar_acoes_desde(inscricao, hoje,
    12 * (SELECT count(*) FROM mentoria_renovacoes r WHERE r.inscricao_id = inscricao)::int + 1));
END $$;
--> statement-breakpoint

-- ------------------------------------------------------------------ renovar
-- "Registrar renovação" (3B, 4B, 2C): numa transação, grava a renovação, anda o término 12 meses, troca a
-- mentoria, gera as ações do novo ano e volta CONCLUIDO a ATIVO. Admin e Acompanhamento (área RENOVACAO, com a
-- carteira); quem não pode recebe 42501 (404 na API). `versao` evita a renovação dobrada no clique duplo.
CREATE FUNCTION mentoria_renovar(inscricao uuid, versao int, nova_mentoria text, data_renovacao date)
  RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE i record; ano_novo int; renovacao uuid; criadas uuid[]; nova int; campos text[];
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT mentoria_edita('RENOVACAO', inscricao) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mentoria_renovacao:' || inscricao));
  SELECT * INTO i FROM mentoria_inscricoes WHERE id = inscricao FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF i.version <> versao THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'P0409';
  END IF;
  IF i.status NOT IN ('ATIVO', 'CONCLUIDO') THEN
    RAISE EXCEPTION 'Só ficha ativa ou concluída pode ser renovada.' USING ERRCODE = '22023';
  END IF;
  IF i.inicio_jornada IS NULL OR i.termino_previsto IS NULL THEN
    RAISE EXCEPTION 'A ficha ainda não tem o início e o término da jornada.' USING ERRCODE = '22023';
  END IF;
  IF nova_mentoria IS NULL OR nova_mentoria NOT IN ('RDV', '2M', '6M') THEN
    RAISE EXCEPTION 'Escolha a mentoria da renovação: RDV, 2M ou 6M.' USING ERRCODE = '22023';
  END IF;
  IF data_renovacao IS NULL OR data_renovacao > hoje
     OR data_renovacao < (hoje - interval '1 year')::date THEN
    RAISE EXCEPTION 'A data da renovação não pode ser futura nem de mais de 1 ano atrás.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::int + 2 INTO ano_novo FROM mentoria_renovacoes WHERE inscricao_id = inscricao;
  INSERT INTO mentoria_renovacoes (inscricao_id, ano, data, mentoria_anterior, mentoria_nova, termino_anterior,
    termino_novo, status_anterior, concluida_em_anterior, registrada_por)
  VALUES (inscricao, ano_novo, data_renovacao, i.mentoria, nova_mentoria, i.termino_previsto,
    (i.termino_previsto + interval '12 months')::date, i.status, i.concluida_em, app_user_id())
  RETURNING id INTO renovacao;
  UPDATE mentoria_inscricoes SET
    termino_previsto = (i.termino_previsto + interval '12 months')::date,
    mentoria = nova_mentoria,
    status = 'ATIVO',
    concluida_em = NULL,
    version = version + 1,
    atualizado_em = now()
  WHERE id = inscricao RETURNING version INTO nova;
  criadas := mentoria_gerar_acoes_desde(inscricao, hoje, 12 * (ano_novo - 1) + 1);
  UPDATE mentoria_renovacoes SET acoes = criadas WHERE id = renovacao;
  campos := ARRAY['terminoPrevisto']
    || CASE WHEN nova_mentoria <> i.mentoria THEN ARRAY['mentoria'] ELSE '{}'::text[] END
    || CASE WHEN i.status <> 'ATIVO' THEN ARRAY['status'] ELSE '{}'::text[] END
    || CASE WHEN cardinality(criadas) > 0 THEN ARRAY['acoes'] ELSE '{}'::text[] END;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.renovada', campos);
  RETURN nova;
END $$;
--> statement-breakpoint

-- Desfazer (G5): só a Admin, só a última renovação, enquanto nenhuma ação que ela criou foi feita e com a ficha
-- ativa. Volta o término pela diferença (as pausas depois da renovação ficam), a mentoria e o status (com a data do
-- Concluído de antes) e apaga as ações pendentes que ela criou.
CREATE FUNCTION mentoria_renovacao_desfazer(inscricao uuid, versao int) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE i record; r record; nova int; campos text[];
BEGIN
  IF NOT mentoria_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mentoria_renovacao:' || inscricao));
  SELECT * INTO i FROM mentoria_inscricoes WHERE id = inscricao FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF i.version <> versao THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = 'P0409';
  END IF;
  SELECT * INTO r FROM mentoria_renovacoes x WHERE x.inscricao_id = inscricao
    ORDER BY x.ano DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta ficha não tem renovação para desfazer.' USING ERRCODE = '22023';
  END IF;
  IF i.status <> 'ATIVO' THEN
    RAISE EXCEPTION 'Só dá para desfazer a renovação com a ficha ativa.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM mentoria_acoes a WHERE a.id = ANY (r.acoes) AND a.status = 'FEITA') THEN
    RAISE EXCEPTION 'Uma ação do novo ano já foi feita: a renovação não pode mais ser desfeita.'
      USING ERRCODE = '22023';
  END IF;
  PERFORM mentoria_enfileirar_midia(ARRAY['ACAO_EVIDENCIA'], array_agg(a.id))
    FROM mentoria_acoes a WHERE a.id = ANY (r.acoes)
    HAVING count(*) > 0;
  DELETE FROM mentoria_acoes a WHERE a.id = ANY (r.acoes) AND a.status = 'PENDENTE';
  UPDATE mentoria_inscricoes SET
    termino_previsto = termino_previsto - (r.termino_novo - r.termino_anterior),
    mentoria = r.mentoria_anterior,
    status = r.status_anterior,
    concluida_em = CASE WHEN r.status_anterior = 'CONCLUIDO' THEN r.concluida_em_anterior END,
    version = version + 1,
    atualizado_em = now()
  WHERE id = inscricao RETURNING version INTO nova;
  DELETE FROM mentoria_renovacoes WHERE id = r.id;
  campos := ARRAY['terminoPrevisto']
    || CASE WHEN r.mentoria_anterior <> i.mentoria THEN ARRAY['mentoria'] ELSE '{}'::text[] END
    || CASE WHEN r.status_anterior <> 'ATIVO' THEN ARRAY['status'] ELSE '{}'::text[] END
    || CASE WHEN cardinality(r.acoes) > 0 THEN ARRAY['acoes'] ELSE '{}'::text[] END;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.renovacao_desfeita', campos);
  RETURN nova;
END $$;
--> statement-breakpoint

-- ------------------------------------------------------------------ aba Renovações
-- Lista e números (1A, 5A, 8A, G4, G6), sobre o que a pessoa vê (RLS; "só a carteira" vê a carteira). SECURITY
-- INVOKER, sem função por linha. Lista: ATIVO com término cujo último mês começa nos próximos 60 dias ou já começou
-- (término − 1 mês ≤ hoje + 60), e as que renovaram nos últimos 60 dias. A reunião é a de Renovação mais recente do
-- ciclo atual (início ≥ término − 12 meses), sem as remarcadas. Números: renovações e Concluídos dos últimos 12 meses.
CREATE FUNCTION mentoria_renovacoes_painel(hoje date) RETURNS jsonb
  LANGUAGE plpgsql STABLE
  SET search_path = public, pg_temp
  SET jit = off
AS $$
DECLARE resultado jsonb;
BEGIN
  IF NOT mentoria_ve_renovacoes() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  WITH ult AS (
    SELECT DISTINCT ON (x.inscricao_id) x.inscricao_id, x.ano, x.data, x.mentoria_anterior, x.mentoria_nova
    FROM mentoria_renovacoes x
    ORDER BY x.inscricao_id, x.ano DESC
  ),
  lista AS (
    SELECT i.id AS inscricao_id,
      (SELECT string_agg(p.nome, ' e ' ORDER BY p.ordem) FROM mentoria_pessoas p WHERE p.inscricao_id = i.id)
        AS nome,
      i.tipo, i.mentoria, i.mentoria_variante, i.responsavel_id, ur.name AS responsavel,
      i.inicio_jornada, i.termino_previsto,
      (i.termino_previsto - interval '1 month')::date AS ultimo_mes_inicio,
      coalesce(u.ano, 1) AS ano,
      CASE WHEN u.data >= hoje - 60 THEN u.data END AS renovada_em,
      CASE WHEN u.data >= hoje - 60 THEN u.mentoria_anterior END AS renovada_de,
      CASE WHEN u.data >= hoje - 60 THEN u.mentoria_nova END AS renovada_para,
      re.status AS reuniao_status,
      re.dia AS reuniao_dia,
      re.interesse_renovar
    FROM mentoria_inscricoes i
    LEFT JOIN ult u ON u.inscricao_id = i.id
    LEFT JOIN "user" ur ON ur.id = i.responsavel_id
    LEFT JOIN LATERAL (
      SELECT r2.status, (r2.inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia, r2.interesse_renovar
      FROM mentoria_reunioes r2
      WHERE r2.inscricao_id = i.id AND r2.tipo = 'RENOVACAO' AND r2.status <> 'REMARCADA'
        AND r2.inicio >= ((i.termino_previsto - interval '12 months')::date)::timestamp
          AT TIME ZONE 'America/Sao_Paulo'
      ORDER BY r2.inicio DESC
      LIMIT 1
    ) re ON true
    WHERE i.status = 'ATIVO' AND i.termino_previsto IS NOT NULL
      AND ((i.termino_previsto - interval '1 month')::date <= hoje + 60
        OR (u.data >= hoje - 60 AND u.data <= hoje))
  )
  SELECT jsonb_build_object(
    'itens', coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.termino_previsto, l.nome) FROM lista l),
      '[]'::jsonb),
    'renovaram', (SELECT count(*)::int FROM mentoria_renovacoes x
      WHERE x.data > (hoje - interval '12 months')::date AND x.data <= hoje),
    'nao_renovaram', (SELECT count(*)::int FROM mentoria_inscricoes c
      WHERE c.status = 'CONCLUIDO' AND c.concluida_em IS NOT NULL
        AND (c.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date > (hoje - interval '12 months')::date
        AND (c.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date <= hoje)
  ) INTO resultado;
  RETURN resultado;
END $$;
--> statement-breakpoint

-- ------------------------------------------------------------------ RLS e grants
-- Lê quem vê a inscrição (o selo "Renovado em" fica ao lado do status na ficha); a aba é que fica só para Admin e
-- Acompanhamento (mentoria_renovacoes_painel). Sem INSERT, UPDATE ou DELETE: só as funções gravam.
ALTER TABLE mentoria_renovacoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_renovacoes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_renovacoes_leitura ON mentoria_renovacoes FOR SELECT USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_visiveis())::uuid[])
);
--> statement-breakpoint
GRANT SELECT ON mentoria_renovacoes TO npac_app;
--> statement-breakpoint
-- O histórico da renovação é escrito pelas funções: npac_app não forja.
DROP POLICY mentoria_historico_criar ON mentoria_historico;
--> statement-breakpoint
CREATE POLICY mentoria_historico_criar ON mentoria_historico FOR INSERT
  WITH CHECK (ator_id = app_user_id() AND mentoria_ve(inscricao_id)
    AND tipo NOT IN ('momento.concluido', 'momento.destravado', 'inscricao.virou_individual',
      'inscricao.pausada', 'inscricao.retomada', 'reuniao.remarcada', 'reuniao.excluida',
      'pme.concluido', 'pme.reaberto', 'inscricao.renovada', 'inscricao.renovacao_desfeita'));
--> statement-breakpoint
ALTER FUNCTION mentoria_ve_renovacoes() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_inscricao_status_regras() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_gerar_acoes_desde(uuid, date, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_renovar(uuid, int, text, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_renovacao_desfazer(uuid, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_renovacoes_painel(date) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_ve_renovacoes(), mentoria_gerar_acoes_desde(uuid, date, int),
  mentoria_renovar(uuid, int, text, date), mentoria_renovacao_desfazer(uuid, int),
  mentoria_renovacoes_painel(date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_ve_renovacoes(), mentoria_renovar(uuid, int, text, date),
  mentoria_renovacao_desfazer(uuid, int), mentoria_renovacoes_painel(date) TO npac_app;
