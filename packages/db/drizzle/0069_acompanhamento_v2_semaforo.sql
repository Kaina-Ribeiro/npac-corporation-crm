CREATE TABLE "mentoria_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"enviado_em" timestamp with time zone NOT NULL,
	"semana" date GENERATED ALWAYS AS ((date_trunc('week', enviado_em at time zone 'America/Sao_Paulo'))::date) STORED NOT NULL,
	"respondeu" boolean DEFAULT false NOT NULL,
	"respondido_em" timestamp with time zone,
	"avanco" text,
	"travou" text,
	"proximo_passo" text,
	"visivel_ao_mentorado" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_checkins_semana_unica" UNIQUE("inscricao_id","semana"),
	CONSTRAINT "mentoria_checkins_respondeu" CHECK ("mentoria_checkins"."respondeu" = ("mentoria_checkins"."respondido_em" is not null)),
	CONSTRAINT "mentoria_checkins_ordem" CHECK ("mentoria_checkins"."respondido_em" >= "mentoria_checkins"."enviado_em"),
	CONSTRAINT "mentoria_checkins_avanco" CHECK (octet_length("mentoria_checkins"."avanco") <= 400000),
	CONSTRAINT "mentoria_checkins_travou" CHECK (octet_length("mentoria_checkins"."travou") <= 400000),
	CONSTRAINT "mentoria_checkins_proximo" CHECK (octet_length("mentoria_checkins"."proximo_passo") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_semaforo_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"semana" date NOT NULL,
	"cor" text NOT NULL,
	"motivos" text[] DEFAULT '{}'::text[] NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_semaforo_historico_semana" UNIQUE("inscricao_id","semana"),
	CONSTRAINT "mentoria_semaforo_historico_cor" CHECK ("mentoria_semaforo_historico"."cor" in ('VERDE', 'AMARELO', 'VERMELHO'))
);
--> statement-breakpoint
CREATE TABLE "mentoria_semaforo_inicio" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"desde" date NOT NULL,
	CONSTRAINT "mentoria_semaforo_inicio_uma" CHECK ("mentoria_semaforo_inicio"."id")
);
--> statement-breakpoint
ALTER TABLE "mentoria_ciclos" ADD COLUMN "segunda_chance_ate" date;--> statement-breakpoint
ALTER TABLE "mentoria_metas" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "mentoria_checkins" ADD CONSTRAINT "mentoria_checkins_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_checkins" ADD CONSTRAINT "mentoria_checkins_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_semaforo_historico" ADD CONSTRAINT "mentoria_semaforo_historico_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_metas" ADD CONSTRAINT "mentoria_metas_status" CHECK ("mentoria_metas"."status" in ('ATINGIDA', 'NAO_ATINGIDA'));--> statement-breakpoint

-- Fase 2, Parte 3: check-in, semáforo, histórico semanal, status da meta e segunda chance
-- (spec 2026-11-11, E9–E16 e §5).

-- Segunda chance (E15) é um novo prazo: depois do prazo original do PME.
ALTER TABLE mentoria_ciclos ADD CONSTRAINT mentoria_ciclos_segunda_chance
  CHECK (segunda_chance_ate > enviado_em + 30);
--> statement-breakpoint
CREATE INDEX mentoria_tarefas_semaforo ON mentoria_tarefas (inscricao_id, prazo)
  WHERE origem = 'REUNIAO';
--> statement-breakpoint

-- Entrada no ar (E13): o dia de Brasília em que esta migration roda, em cada ambiente.
INSERT INTO mentoria_semaforo_inicio (id, desde)
  VALUES (true, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
--> statement-breakpoint
ALTER TABLE mentoria_semaforo_inicio ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_semaforo_inicio FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Áreas novas: CHECKIN (lançar check-in, E9) e SEGUNDA_CHANCE (E15), Admin e Acompanhamento.
CREATE OR REPLACE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO',
        'CONTATO', 'ANOTACAO', 'PME', 'TAREFA', 'META', 'CHECKIN', 'SEGUNDA_CHANCE')
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO', 'PME')
      WHEN 'ESPECIALISTA' THEN area IN ('ANOTACAO', 'REUNIAO') AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint

-- Status do ciclo com a segunda chance (E15): SEGUNDA_CHANCE enquanto hoje <= a data. Depois dela
-- volta a EM_ANDAMENTO, com o atraso contado do novo prazo (E16). Uma implementação só: a versão
-- de 4 argumentos (0059) passa a chamar esta, sem segunda chance.
CREATE FUNCTION mentoria_ciclo_status(concluido date, nao_concluido date, prazo date,
    segunda_chance date, hoje date)
  RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN concluido IS NOT NULL THEN 'CONCLUIDO'
    WHEN nao_concluido IS NOT NULL THEN 'NAO_CONCLUIDO'
    WHEN segunda_chance IS NOT NULL AND hoje <= segunda_chance THEN 'SEGUNDA_CHANCE'
    ELSE 'EM_ANDAMENTO'
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_ciclo_status(concluido date, nao_concluido date, prazo date, hoje date)
  RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_ciclo_status(concluido, nao_concluido, prazo, NULL::date, hoje)
$$;
--> statement-breakpoint

-- Ciclo (refeito da 0057): a segunda chance é da área SEGUNDA_CHANCE e só no ciclo aberto.
CREATE OR REPLACE FUNCTION mentoria_ciclo_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM mentoria_ciclos c
               WHERE c.inscricao_id = NEW.inscricao_id AND c.numero >= NEW.numero) THEN
      RAISE EXCEPTION 'Este PME ou um seguinte já foi registrado' USING ERRCODE = '22023';
    END IF;
    NEW.criado_por := app_user_id();
    NEW.segunda_chance_ate := NULL;
    RETURN NEW;
  END IF;
  IF NEW.concluido_em IS DISTINCT FROM OLD.concluido_em THEN
    IF NOT mentoria_edita('TAREFA', NEW.inscricao_id) THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM mentoria_tarefas t
               WHERE t.ciclo_id = NEW.id AND t.origem = 'ENCERRAMENTO') THEN
      RAISE EXCEPTION 'Marque a tarefa de encerramento do PME' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.segunda_chance_ate IS DISTINCT FROM OLD.segunda_chance_ate THEN
    IF NOT mentoria_edita('SEGUNDA_CHANCE', NEW.inscricao_id) THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
    IF OLD.concluido_em IS NOT NULL OR OLD.nao_concluido_em IS NOT NULL THEN
      RAISE EXCEPTION 'Segunda chance só no PME em andamento' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

-- Check-in: quem lançou é do banco.
CREATE FUNCTION mentoria_checkin_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  NEW.criado_por := app_user_id();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_checkin_guarda BEFORE INSERT ON mentoria_checkins
  FOR EACH ROW EXECUTE FUNCTION mentoria_checkin_guarda();
--> statement-breakpoint

-- Semáforo (§5). Só ATIVO; nada para pausado e os demais. Semana = segunda a domingo de Brasília;
-- válida = começa depois da entrada no ar e depois do início da jornada (E13). Todo mundo começa
-- verde: tarefas contam com prazo a partir da entrada no ar, e o atraso do PME conta do prazo atual
-- (segunda chance ou prazo, E16) ou da entrada no ar, o que vier depois. Tarefas: as da reunião
-- (PDF p. 10, passo 6); as do ciclo vencem no prazo do PME, que tem PME_7/PME_15. Interna: quem vê
-- decide `mentoria_semaforo`.
CREATE FUNCTION mentoria_semaforo_calc(inscricao uuid, dia date)
  RETURNS TABLE (cor text, motivos text[])
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  desde date := (SELECT s.desde FROM mentoria_semaforo_inicio s);
  w1 date := date_trunc('week', dia::timestamp)::date - 7;
  w2 date := date_trunc('week', dia::timestamp)::date - 14;
  st text;
  inicio date;
  ok1 boolean;
  ok2 boolean;
  r1 boolean;
  r2 boolean;
  ruins boolean[];
  atraso int;
  m text[] := '{}';
BEGIN
  SELECT x.status, x.inicio_jornada INTO st, inicio FROM mentoria_inscricoes x WHERE x.id = inscricao;
  IF st IS DISTINCT FROM 'ATIVO' OR desde IS NULL THEN RETURN; END IF;

  -- Check-in (E11): semana válida sem check-in respondido, enviado ou não.
  ok1 := w1 > desde AND inicio IS NOT NULL AND w1 > inicio;
  ok2 := w2 > desde AND inicio IS NOT NULL AND w2 > inicio;
  r1 := EXISTS (SELECT 1 FROM mentoria_checkins c
                WHERE c.inscricao_id = inscricao AND c.semana = w1 AND c.respondeu);
  r2 := EXISTS (SELECT 1 FROM mentoria_checkins c
                WHERE c.inscricao_id = inscricao AND c.semana = w2 AND c.respondeu);
  IF ok1 AND ok2 AND NOT r1 AND NOT r2 THEN m := m || 'CHECKIN_2'::text;
  ELSIF ok1 AND NOT r1 THEN m := m || 'CHECKIN_1'::text;
  END IF;

  -- Tarefa (E12): as 2 últimas vencidas pelo prazo; NAO_FEITA ou ainda PENDENTE contam.
  SELECT array_agg(v.ruim ORDER BY v.n) INTO ruins FROM (
    SELECT t.status IN ('NAO_FEITA', 'PENDENTE') AS ruim,
      row_number() OVER (ORDER BY t.prazo DESC, t.criado_em DESC, t.id DESC) AS n
    FROM mentoria_tarefas t
    WHERE t.inscricao_id = inscricao AND t.origem = 'REUNIAO'
      AND t.prazo < dia AND t.prazo >= desde
    ORDER BY t.prazo DESC, t.criado_em DESC, t.id DESC
    LIMIT 2) v;
  IF coalesce(cardinality(ruins), 0) = 2 AND ruins[1] AND ruins[2] THEN m := m || 'TAREFA_2'::text;
  ELSIF coalesce(ruins[1], false) THEN m := m || 'TAREFA_1'::text;
  END IF;

  -- PME (PDF p. 19, E16): atraso do ciclo aberto.
  SELECT dia - greatest(coalesce(c.segunda_chance_ate, c.prazo), desde) INTO atraso
  FROM mentoria_ciclos c
  WHERE c.inscricao_id = inscricao AND c.concluido_em IS NULL AND c.nao_concluido_em IS NULL;
  IF atraso >= 15 THEN m := m || 'PME_15'::text;
  ELSIF atraso >= 7 THEN m := m || 'PME_7'::text;
  END IF;

  cor := CASE
    WHEN m && ARRAY['CHECKIN_2', 'TAREFA_2', 'PME_15'] THEN 'VERMELHO'
    WHEN cardinality(m) > 0 THEN 'AMARELO'
    ELSE 'VERDE'
  END;
  motivos := m;
  RETURN NEXT;
END $$;
--> statement-breakpoint

-- Para a API: Admin, Acompanhamento e Operação (a Especialista não vê semáforo nem check-ins, §2).
CREATE FUNCTION mentoria_semaforo(inscricao uuid, dia date)
  RETURNS TABLE (cor text, motivos text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.cor, s.motivos FROM mentoria_semaforo_calc(inscricao, dia) s WHERE mentoria_ve_todas()
$$;
--> statement-breakpoint

-- Sequência de semanas com check-in respondido (PDF p. 8), da última encerrada para trás.
CREATE FUNCTION mentoria_sequencia_checkins(inscricao uuid, dia date) RETURNS int
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  w date := date_trunc('week', dia::timestamp)::date - 7;
  n int := 0;
BEGIN
  IF NOT mentoria_ve_todas() THEN RETURN NULL; END IF;
  WHILE n < 520 AND EXISTS (SELECT 1 FROM mentoria_checkins c
      WHERE c.inscricao_id = inscricao AND c.semana = w AND c.respondeu) LOOP
    n := n + 1;
    w := w - 7;
  END LOOP;
  RETURN n;
END $$;
--> statement-breakpoint

-- Histórico (§5): a cor de cada semana que acabou depois da entrada no ar e do início da jornada,
-- calculada na segunda-feira seguinte, a partir da última gravada. Idempotente; chamada pelo
-- despertador do módulo ao subir a API e na virada da semana.
CREATE FUNCTION mentoria_semaforo_gravar(hoje date) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  desde date := (SELECT s.desde FROM mentoria_semaforo_inicio s);
  ultima date := date_trunc('week', hoje::timestamp)::date - 7;
  i record;
  s record;
  w date;
  k int;
  n int := 0;
BEGIN
  IF desde IS NULL THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mentoria_semaforo_gravar'));
  FOR i IN
    SELECT x.id, x.inicio_jornada,
      (SELECT max(h.semana) FROM mentoria_semaforo_historico h WHERE h.inscricao_id = x.id) AS gravada
    FROM mentoria_inscricoes x WHERE x.status = 'ATIVO'
  LOOP
    w := greatest(date_trunc('week', desde::timestamp)::date,
      date_trunc('week', coalesce(i.inicio_jornada, desde)::timestamp)::date,
      i.gravada + 7, ultima - 7 * 104);
    WHILE w <= ultima LOOP
      SELECT * INTO s FROM mentoria_semaforo_calc(i.id, w + 7);
      IF s.cor IS NOT NULL THEN
        INSERT INTO mentoria_semaforo_historico (inscricao_id, semana, cor, motivos)
          VALUES (i.id, w, s.cor, s.motivos)
          ON CONFLICT (inscricao_id, semana) DO NOTHING;
        GET DIAGNOSTICS k = ROW_COUNT;
        n := n + k;
      END IF;
      w := w + 7;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
--> statement-breakpoint

-- LGPD (0058) passa a apagar também os textos dos check-ins.
CREATE OR REPLACE FUNCTION mentoria_anonimizar_inscricao(inscricao uuid) RETURNS void
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
  UPDATE mentoria_tarefas SET descricao = NULL, motivo = NULL, version = version + 1,
    atualizado_em = now()
  WHERE inscricao_id = inscricao;
  UPDATE mentoria_metas SET descricao = NULL, unidade = NULL, version = version + 1,
    atualizado_em = now()
  WHERE inscricao_id = inscricao;
  UPDATE mentoria_checkins SET avanco = NULL, travou = NULL, proximo_passo = NULL,
    version = version + 1, atualizado_em = now()
  WHERE inscricao_id = inscricao;
  UPDATE mentoria_envios_fisicos SET rastreio = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_inscricoes SET link_pasta = NULL, link_grupo = NULL, importacao_chave = NULL,
    importacao_apelidos = '{}', completar_campos = '{}', version = version + 1,
    atualizado_em = now()
  WHERE id = inscricao;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.anonimizada', ARRAY['pessoas', 'contato',
      'endereco', 'momento', 'anotacoes', 'midia', 'tarefas', 'metas', 'checkins']);
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_ciclo_status(date, date, date, date, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_checkin_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_semaforo_calc(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_semaforo(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_sequencia_checkins(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_semaforo_gravar(date) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_semaforo_calc(uuid, date), mentoria_semaforo(uuid, date),
  mentoria_sequencia_checkins(uuid, date), mentoria_semaforo_gravar(date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_semaforo(uuid, date), mentoria_sequencia_checkins(uuid, date),
  mentoria_semaforo_gravar(date) TO npac_app;
--> statement-breakpoint

-- Check-ins: leitura de Admin, Acompanhamento e Operação; escrita pela área CHECKIN. Sem DELETE.
ALTER TABLE mentoria_checkins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_checkins FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_checkins_leitura ON mentoria_checkins FOR SELECT
  USING ((SELECT mentoria_ve_todas()));
--> statement-breakpoint
CREATE POLICY mentoria_checkins_criar ON mentoria_checkins FOR INSERT
  WITH CHECK (mentoria_edita('CHECKIN', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_checkins_editar ON mentoria_checkins FOR UPDATE
  USING (mentoria_edita('CHECKIN', inscricao_id)) WITH CHECK (mentoria_edita('CHECKIN', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_checkins TO npac_app;
--> statement-breakpoint
GRANT UPDATE (enviado_em, respondeu, respondido_em, avanco, travou, proximo_passo, version,
  atualizado_em) ON mentoria_checkins TO npac_app;
--> statement-breakpoint

-- Histórico do semáforo: leitura de quem vê o semáforo; escrita só por mentoria_semaforo_gravar.
ALTER TABLE mentoria_semaforo_historico ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_semaforo_historico FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_semaforo_historico_leitura ON mentoria_semaforo_historico FOR SELECT
  USING ((SELECT mentoria_ve_todas()));
--> statement-breakpoint
GRANT SELECT ON mentoria_semaforo_historico TO npac_app;
--> statement-breakpoint

-- Segunda chance (o gatilho do ciclo barra a Operação) e status da meta (área META).
GRANT UPDATE (segunda_chance_ate) ON mentoria_ciclos TO npac_app;
--> statement-breakpoint
GRANT UPDATE (status) ON mentoria_metas TO npac_app;
