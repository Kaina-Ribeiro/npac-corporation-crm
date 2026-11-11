CREATE TABLE "mentoria_pausas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"inicio" date NOT NULL,
	"fim" date,
	"status_anterior" text NOT NULL,
	"motivo" text,
	"pausada_por" text,
	"retomada_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_pausas_anterior" CHECK ("mentoria_pausas"."status_anterior" in ('ONBOARDING', 'ATIVO')),
	CONSTRAINT "mentoria_pausas_ordem" CHECK ("mentoria_pausas"."fim" >= "mentoria_pausas"."inicio"),
	CONSTRAINT "mentoria_pausas_motivo" CHECK (octet_length("mentoria_pausas"."motivo") <= 400000)
);
--> statement-breakpoint
ALTER TABLE "mentoria_pausas" ADD CONSTRAINT "mentoria_pausas_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_pausas" ADD CONSTRAINT "mentoria_pausas_pausada_por_user_id_fk" FOREIGN KEY ("pausada_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_pausas" ADD CONSTRAINT "mentoria_pausas_retomada_por_user_id_fk" FOREIGN KEY ("retomada_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mentoria_pausas_aberta" ON "mentoria_pausas" USING btree ("inscricao_id") WHERE "mentoria_pausas"."fim" is null;--> statement-breakpoint
CREATE INDEX "mentoria_pausas_inscricao" ON "mentoria_pausas" USING btree ("inscricao_id","inicio");
--> statement-breakpoint

-- Quem já estava PAUSADO antes desta tabela ganha a pausa aberta: sem ela, não teria como retomar.
INSERT INTO mentoria_pausas (inscricao_id, inicio, status_anterior)
SELECT i.id, (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  CASE WHEN EXISTS (SELECT 1 FROM mentoria_onboarding_etapas e
    WHERE e.inscricao_id = i.id AND e.status IN ('PENDENTE', 'ENVIADA'))
    THEN 'ONBOARDING' ELSE 'ATIVO' END
FROM mentoria_inscricoes i WHERE i.status = 'PAUSADO';
--> statement-breakpoint

-- Dias parados da jornada até `ate`. Só conta o que passou depois do início da jornada.
CREATE FUNCTION mentoria_dias_pausados(inscricao uuid, ate date) RETURNS int
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT coalesce(sum(greatest(
    least(coalesce(p.fim, ate), ate) - greatest(p.inicio, coalesce(i.inicio_jornada, p.inicio)),
    0)), 0)::int
  FROM mentoria_pausas p JOIN mentoria_inscricoes i ON i.id = p.inscricao_id
  WHERE p.inscricao_id = inscricao
$$;
--> statement-breakpoint

-- Mês da jornada descontando as pausas. Mesma conta da 0045, sobre o dia sem os dias parados.
CREATE OR REPLACE FUNCTION mentoria_mes_jornada(inscricao uuid, hoje date) RETURNS int
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN i.inicio_jornada IS NULL OR d.efetivo < i.inicio_jornada THEN NULL ELSE (
    SELECT max(m)::int FROM generate_series(1, (
      extract(year FROM age(d.efetivo, i.inicio_jornada)) * 12
      + extract(month FROM age(d.efetivo, i.inicio_jornada)) + 2)::int) m
    WHERE i.inicio_jornada + make_interval(months => m - 1) <= d.efetivo
  ) END
  FROM mentoria_inscricoes i
  CROSS JOIN LATERAL (SELECT hoje - mentoria_dias_pausados(i.id, hoje) AS efetivo) d
  WHERE i.id = inscricao
$$;
--> statement-breakpoint

-- Uma data do calendário, empurrada pelas pausas já fechadas que aconteceram antes dela. É a
-- mesma conta de mentoria_retomar: corrigir o início depois de pausar dá o mesmo resultado.
CREATE OR REPLACE FUNCTION mentoria_data_ajustada(inscricao uuid, comeco date, base date) RETURNS date
  LANGUAGE plpgsql STABLE
  SET search_path = public, pg_temp
AS $$
DECLARE p record; d date := base; de date;
BEGIN
  FOR p IN
    SELECT x.inicio AS ini, x.fim AS ate FROM mentoria_pausas x
    WHERE x.inscricao_id = inscricao AND x.fim IS NOT NULL ORDER BY x.inicio, x.fim
  LOOP
    de := greatest(p.ini, comeco);
    IF p.ate > de AND d >= de THEN d := d + (p.ate - de); END IF;
  END LOOP;
  RETURN d;
END $$;
--> statement-breakpoint

-- Término que o sistema calcularia: 12 meses mais todo dia parado depois do início. Retomar soma
-- os dias sempre; é com esta conta que a correção do início sabe se o término foi editado à mão.
CREATE FUNCTION mentoria_termino_calculado(inscricao uuid, comeco date) RETURNS date
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT (comeco + interval '12 months')::date + coalesce((
    SELECT sum(greatest(p.fim - greatest(p.inicio, comeco), 0))::int
    FROM mentoria_pausas p WHERE p.inscricao_id = inscricao AND p.fim IS NOT NULL), 0)
$$;
--> statement-breakpoint

-- De quando contam os dias parado: o mais recente entre o envio e a última retomada. Em etapa
-- ainda não enviada devolve só a retomada; a API compara com a conclusão da anterior.
CREATE OR REPLACE FUNCTION mentoria_onboarding_base(etapa_id uuid) RETURNS timestamptz
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT greatest(e.enviada_em, (
    SELECT max(p.fim)::timestamp AT TIME ZONE 'America/Sao_Paulo'
    FROM mentoria_pausas p WHERE p.inscricao_id = e.inscricao_id AND p.fim IS NOT NULL))
  FROM mentoria_onboarding_etapas e WHERE e.id = etapa_id
$$;
--> statement-breakpoint

-- Entrar e sair de PAUSADO só pelas funções, que abrem e fecham a pausa.
CREATE FUNCTION mentoria_status_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.status = 'PAUSADO')
     OR (TG_OP = 'UPDATE' AND (NEW.status = 'PAUSADO') <> (OLD.status = 'PAUSADO')) THEN
    RAISE EXCEPTION 'Use a ação de pausar ou retomar' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_status_guarda BEFORE INSERT OR UPDATE OF status ON mentoria_inscricoes
  FOR EACH ROW EXECUTE FUNCTION mentoria_status_guarda();
--> statement-breakpoint

-- Pausar e retomar: ADMIN e ACOMPANHAMENTO (§5). `motivo` já chega cifrado pela API.
CREATE FUNCTION mentoria_pausar(inscricao uuid, pausa uuid, motivo_cifrado text) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE atual text; nova int;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (mentoria_admin() OR coalesce(mentoria_perfil() = 'ACOMPANHAMENTO', false)) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO atual FROM mentoria_inscricoes WHERE id = inscricao FOR UPDATE;
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
END $$;
--> statement-breakpoint

-- Retomar: fecha a pausa, volta ao status anterior e repõe os dias parados no término e nas
-- pendentes. Feitas, atrasadas antes da pausa e anteriores ao sistema ficam como estão. A data e o
-- limite andam cada um por si: no FLEXIVEL, o mês já começado continua com a data e ganha prazo.
CREATE FUNCTION mentoria_retomar(inscricao uuid) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE i record; p record; dias int; de date; nova int;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (mentoria_admin() OR coalesce(mentoria_perfil() = 'ACOMPANHAMENTO', false)) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO i FROM mentoria_inscricoes WHERE id = inscricao FOR UPDATE;
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
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_dias_pausados(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_status_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_pausar(uuid, uuid, text) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_retomar(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_termino_calculado(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_pausar(uuid, uuid, text), mentoria_retomar(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_dias_pausados(uuid, date), mentoria_pausar(uuid, uuid, text),
  mentoria_retomar(uuid), mentoria_termino_calculado(uuid, date) TO npac_app;
--> statement-breakpoint

-- Sem INSERT ou UPDATE: pausa só muda pelas funções.
ALTER TABLE mentoria_pausas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_pausas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_pausas_leitura ON mentoria_pausas FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
GRANT SELECT ON mentoria_pausas TO npac_app;
--> statement-breakpoint

-- O histórico dessas ações é escrito pelas funções: npac_app não forja.
DROP POLICY mentoria_historico_criar ON mentoria_historico;
--> statement-breakpoint
CREATE POLICY mentoria_historico_criar ON mentoria_historico FOR INSERT
  WITH CHECK (ator_id = app_user_id() AND mentoria_ve(inscricao_id)
    AND tipo NOT IN ('momento.concluido', 'momento.destravado', 'inscricao.virou_individual',
      'inscricao.pausada', 'inscricao.retomada'));
