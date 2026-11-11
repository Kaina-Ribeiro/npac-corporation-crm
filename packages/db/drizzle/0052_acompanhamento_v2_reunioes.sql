CREATE TABLE "mentoria_contatos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"feito_por" text NOT NULL,
	"quando" timestamp with time zone NOT NULL,
	"canal" text NOT NULL,
	"motivo" text,
	"respondeu" boolean,
	"tempo_resposta_min" integer,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_contatos_canal" CHECK ("mentoria_contatos"."canal" in ('WHATSAPP', 'LIGACAO', 'EMAIL', 'REUNIAO', 'OUTRO')),
	CONSTRAINT "mentoria_contatos_motivo" CHECK (char_length("mentoria_contatos"."motivo") <= 200),
	CONSTRAINT "mentoria_contatos_tempo" CHECK ("mentoria_contatos"."tempo_resposta_min" between 0 and 100000),
	CONSTRAINT "mentoria_contatos_observacao" CHECK (octet_length("mentoria_contatos"."observacao") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_reunioes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"conduzida_por" text,
	"condutor_inscricao_id" uuid,
	"inicio" timestamp with time zone NOT NULL,
	"duracao_min" smallint DEFAULT 60 NOT NULL,
	"plataforma" text,
	"link" text,
	"status" text DEFAULT 'AGENDADA' NOT NULL,
	"remarcada_para_id" uuid,
	"resumo" text,
	"metas" text,
	"combinado" text,
	"cobrar" text,
	"trava" text,
	"anotacao_interna" text,
	"humor" smallint,
	"interesse_renovar" boolean,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_reunioes_tipo" CHECK ("mentoria_reunioes"."tipo" in ('IDR', 'ACOMP_2PME', 'POSICIONAMENTO', 'MENTORADO_EXPERIENTE', 'CARTOES_MILHAS', 'MENSAL_6M', 'TRIMESTRAL_2M', 'ACOMP_EMERGENCIA', 'RENOVACAO')),
	CONSTRAINT "mentoria_reunioes_status" CHECK ("mentoria_reunioes"."status" in ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO', 'REALIZADA', 'FALTOU', 'REMARCADA')),
	CONSTRAINT "mentoria_reunioes_plataforma" CHECK ("mentoria_reunioes"."plataforma" in ('ZOOM', 'MEET')),
	CONSTRAINT "mentoria_reunioes_link" CHECK ("mentoria_reunioes"."link" ~ '^https://' and char_length("mentoria_reunioes"."link") <= 2000),
	CONSTRAINT "mentoria_reunioes_duracao" CHECK ("mentoria_reunioes"."duracao_min" between 5 and 480),
	CONSTRAINT "mentoria_reunioes_humor" CHECK ("mentoria_reunioes"."humor" between 1 and 5),
	CONSTRAINT "mentoria_reunioes_condutor" CHECK ("mentoria_reunioes"."tipo" = 'MENTORADO_EXPERIENTE' or ("mentoria_reunioes"."conduzida_por" is not null and "mentoria_reunioes"."condutor_inscricao_id" is null)),
	CONSTRAINT "mentoria_reunioes_renovar" CHECK ("mentoria_reunioes"."interesse_renovar" is null or "mentoria_reunioes"."tipo" = 'RENOVACAO'),
	CONSTRAINT "mentoria_reunioes_remarcada" CHECK ("mentoria_reunioes"."remarcada_para_id" is null or "mentoria_reunioes"."status" = 'REMARCADA'),
	CONSTRAINT "mentoria_reunioes_resumo" CHECK (octet_length("mentoria_reunioes"."resumo") <= 400000),
	CONSTRAINT "mentoria_reunioes_metas" CHECK (octet_length("mentoria_reunioes"."metas") <= 400000),
	CONSTRAINT "mentoria_reunioes_combinado" CHECK (octet_length("mentoria_reunioes"."combinado") <= 400000),
	CONSTRAINT "mentoria_reunioes_cobrar" CHECK (octet_length("mentoria_reunioes"."cobrar") <= 400000),
	CONSTRAINT "mentoria_reunioes_trava" CHECK (octet_length("mentoria_reunioes"."trava") <= 400000),
	CONSTRAINT "mentoria_reunioes_anotacao" CHECK (octet_length("mentoria_reunioes"."anotacao_interna") <= 400000)
);
--> statement-breakpoint
ALTER TABLE "mentoria_contatos" ADD CONSTRAINT "mentoria_contatos_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_contatos" ADD CONSTRAINT "mentoria_contatos_feito_por_user_id_fk" FOREIGN KEY ("feito_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_reunioes" ADD CONSTRAINT "mentoria_reunioes_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_reunioes" ADD CONSTRAINT "mentoria_reunioes_conduzida_por_user_id_fk" FOREIGN KEY ("conduzida_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_reunioes" ADD CONSTRAINT "mentoria_reunioes_condutor_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("condutor_inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_reunioes" ADD CONSTRAINT "mentoria_reunioes_remarcada_para_id_mentoria_reunioes_id_fk" FOREIGN KEY ("remarcada_para_id") REFERENCES "public"."mentoria_reunioes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_reunioes" ADD CONSTRAINT "mentoria_reunioes_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_contatos_inscricao" ON "mentoria_contatos" USING btree ("inscricao_id","quando");--> statement-breakpoint
CREATE INDEX "mentoria_reunioes_inscricao" ON "mentoria_reunioes" USING btree ("inscricao_id","inicio");--> statement-breakpoint
CREATE INDEX "mentoria_reunioes_inicio" ON "mentoria_reunioes" USING btree ("inicio");--> statement-breakpoint
CREATE INDEX "mentoria_reunioes_condutor" ON "mentoria_reunioes" USING btree ("conduzida_por","inicio");
--> statement-breakpoint

-- Especialista (§3): vê as inscrições em que conduz alguma reunião. Excluir a última reunião dela
-- tira o acesso. SECURITY DEFINER com dono npac_owner (BYPASSRLS): sem recursão pela policy.
CREATE OR REPLACE FUNCTION mentoria_ve(inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN true
      WHEN 'OPERACAO' THEN true
      WHEN 'ESPECIALISTA' THEN EXISTS (
        SELECT 1 FROM mentoria_reunioes r
        WHERE r.inscricao_id = inscricao AND r.conduzida_por = app_user_id())
      ELSE false
    END, false)
$$;
--> statement-breakpoint
-- Especialista edita reunião só nas inscrições que vê; a linha é decidida por mentoria_edita_reuniao.
CREATE OR REPLACE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN
        area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO', 'CONTATO', 'ANOTACAO')
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO')
      WHEN 'ESPECIALISTA' THEN area IN ('ANOTACAO', 'REUNIAO') AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint
-- Linha de reunião: a Especialista vê só as que conduz.
CREATE FUNCTION mentoria_ve_reuniao(condutor text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN true
      WHEN 'OPERACAO' THEN true
      WHEN 'ESPECIALISTA' THEN condutor = app_user_id()
      ELSE false
    END, false)
$$;
--> statement-breakpoint
-- E edita só as que conduz, fora a IDR: a IDR inicia os 12 meses e quem a registra é Admin,
-- Acompanhamento ou Operação (§3, F9).
CREATE FUNCTION mentoria_edita_reuniao(condutor text, tipo text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN true
      WHEN 'OPERACAO' THEN true
      WHEN 'ESPECIALISTA' THEN condutor = app_user_id() AND tipo <> 'IDR' AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint

-- Estados (§6): AGENDADA → CONFIRMADA → LINK_ENVIADO → REALIZADA, sem voltar. REALIZADA e FALTOU
-- só depois do horário; REMARCADA só pela função de remarcar; encerrada não muda de estado.
CREATE FUNCTION mentoria_reuniao_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE ordem text[] := ARRAY['AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO'];
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'AGENDADA' OR NEW.remarcada_para_id IS NOT NULL THEN
      RAISE EXCEPTION 'A reunião nasce agendada' USING ERRCODE = '22023';
    END IF;
    NEW.criado_por := app_user_id();
    RETURN NEW;
  END IF;
  IF NEW.remarcada_para_id IS DISTINCT FROM OLD.remarcada_para_id
     OR (NEW.status = 'REMARCADA' AND OLD.status <> 'REMARCADA') THEN
    RAISE EXCEPTION 'Use a ação de remarcar' USING ERRCODE = '22023';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('REALIZADA', 'FALTOU', 'REMARCADA') THEN
      RAISE EXCEPTION 'Esta reunião já foi encerrada' USING ERRCODE = '22023';
    END IF;
    IF NEW.status IN ('REALIZADA', 'FALTOU') AND NEW.inicio > now() THEN
      RAISE EXCEPTION 'A reunião ainda não aconteceu' USING ERRCODE = '22023';
    END IF;
    IF NEW.status = ANY (ordem)
       AND array_position(ordem, NEW.status) < array_position(ordem, OLD.status) THEN
      RAISE EXCEPTION 'A reunião não volta de estado' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_reuniao_guarda BEFORE INSERT OR UPDATE ON mentoria_reunioes
  FOR EACH ROW EXECUTE FUNCTION mentoria_reuniao_guarda();
--> statement-breakpoint

-- A etapa IDR segue a reunião (F7): realizada → CONCLUIDA; alguma em aberto → ENVIADA; senão
-- PENDENTE (volta a "agendar a IDR" depois de FALTOU ou REMARCADA sem nova). Dispensada e anterior
-- ao sistema ficam como estão.
CREATE FUNCTION mentoria_sincronizar_idr(inscricao uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE realizada timestamptz; aberta timestamptz; marcada timestamptz; novo text; envio timestamptz;
BEGIN
  SELECT min(r.inicio) FILTER (WHERE r.status = 'REALIZADA'),
         min(r.criado_em) FILTER (WHERE r.status IN ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO')),
         min(r.criado_em) FILTER (WHERE r.status = 'REALIZADA')
    INTO realizada, aberta, marcada
    FROM mentoria_reunioes r WHERE r.inscricao_id = inscricao AND r.tipo = 'IDR';
  novo := CASE WHEN realizada IS NOT NULL THEN 'CONCLUIDA'
               WHEN aberta IS NOT NULL THEN 'ENVIADA' ELSE 'PENDENTE' END;
  envio := CASE WHEN novo = 'CONCLUIDA' THEN marcada WHEN novo = 'ENVIADA' THEN aberta END;
  UPDATE mentoria_onboarding_etapas e SET
    status = novo,
    enviada_em = envio,
    concluida_em = realizada,
    version = e.version + 1,
    atualizado_em = now()
  WHERE e.inscricao_id = inscricao AND e.etapa = 'IDR'
    AND e.status NOT IN ('DISPENSADA', 'ANTERIOR_AO_SISTEMA')
    AND (e.status, e.enviada_em, e.concluida_em) IS DISTINCT FROM (novo, envio, realizada);
END $$;
--> statement-breakpoint

-- Reunião realizada conclui a ação do mesmo tipo (§5): a pendente do período mais recente que já
-- começou; sem ela, a próxima dos 30 dias seguintes (reunião um pouco antes da data). Uma segunda
-- reunião não acha nada pendente e não dá erro. Marca o passo "Reunião registrada", se houver.
CREATE FUNCTION mentoria_reuniao_conclui_acao(reuniao uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE r record; alvo uuid; mes_alvo int; dia date;
BEGIN
  SELECT * INTO r FROM mentoria_reunioes WHERE id = reuniao;
  IF NOT FOUND OR r.status <> 'REALIZADA' THEN RETURN; END IF;
  dia := (r.inicio AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT a.id, a.mes INTO alvo, mes_alvo FROM mentoria_acoes a
    WHERE a.inscricao_id = r.inscricao_id AND a.reuniao_tipo = r.tipo AND a.status = 'PENDENTE'
      AND a.data_prevista <= dia
    ORDER BY a.data_prevista DESC, a.mes DESC LIMIT 1 FOR UPDATE;
  IF alvo IS NULL THEN
    SELECT a.id, a.mes INTO alvo, mes_alvo FROM mentoria_acoes a
      WHERE a.inscricao_id = r.inscricao_id AND a.reuniao_tipo = r.tipo AND a.status = 'PENDENTE'
        AND a.data_prevista <= dia + 30
      ORDER BY a.data_prevista, a.mes LIMIT 1 FOR UPDATE;
  END IF;
  IF alvo IS NULL THEN RETURN; END IF;
  UPDATE mentoria_acoes a SET
    status = 'FEITA',
    feita_em = now(),
    feita_por = app_user_id(),
    itens_feitos = a.itens_feitos || ARRAY(
      SELECT x FROM unnest(a.itens) x
      WHERE x = 'Reunião registrada' AND NOT x = ANY (a.itens_feitos)),
    version = a.version + 1,
    atualizado_em = now()
  WHERE a.id = alvo;
  IF app_user_id() IS NOT NULL THEN
    INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
      VALUES (r.inscricao_id, app_user_id(), 'acao.feita',
        ARRAY['mes_' || mes_alvo, 'status', 'reuniao']);
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION mentoria_reuniao_efeitos() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tipo = 'IDR' THEN PERFORM mentoria_sincronizar_idr(NEW.inscricao_id); END IF;
  IF NEW.status = 'REALIZADA' AND (TG_OP = 'INSERT' OR OLD.status <> 'REALIZADA') THEN
    PERFORM mentoria_reuniao_conclui_acao(NEW.id);
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_reuniao_efeitos AFTER INSERT OR UPDATE OF status ON mentoria_reunioes
  FOR EACH ROW EXECUTE FUNCTION mentoria_reuniao_efeitos();
--> statement-breakpoint

-- Remarcar (§6): a atual vira REMARCADA e nasce uma nova AGENDADA ligada, com o mesmo condutor.
CREATE FUNCTION mentoria_remarcar_reuniao(reuniao uuid, nova uuid, novo_inicio timestamptz, versao int)
  RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM mentoria_reunioes WHERE id = reuniao FOR UPDATE;
  IF NOT FOUND OR NOT mentoria_ve_reuniao(r.conduzida_por, r.inscricao_id)
     OR NOT mentoria_edita_reuniao(r.conduzida_por, r.tipo, r.inscricao_id) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF r.version <> versao THEN
    RAISE EXCEPTION 'Conflito de versão' USING ERRCODE = 'P0409';
  END IF;
  IF r.status NOT IN ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO') THEN
    RAISE EXCEPTION 'Só reunião em aberto pode ser remarcada' USING ERRCODE = '22023';
  END IF;
  INSERT INTO mentoria_reunioes (id, inscricao_id, tipo, conduzida_por, condutor_inscricao_id, inicio,
    duracao_min, plataforma, link, criado_por)
  VALUES (nova, r.inscricao_id, r.tipo, r.conduzida_por, r.condutor_inscricao_id, novo_inicio,
    r.duracao_min, r.plataforma, r.link, app_user_id());
  UPDATE mentoria_reunioes SET status = 'REMARCADA', remarcada_para_id = nova,
    version = version + 1, atualizado_em = now()
  WHERE id = reuniao;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (r.inscricao_id, app_user_id(), 'reuniao.remarcada', ARRAY[r.tipo, 'status', 'inicio']);
END $$;
--> statement-breakpoint

-- Marcada por engano (§6): AGENDADA sem registro; Admin, Acompanhamento e Operação. Assim a
-- Especialista não ganha acesso permanente por erro.
CREATE FUNCTION mentoria_excluir_reuniao(reuniao uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM mentoria_reunioes WHERE id = reuniao FOR UPDATE;
  IF NOT FOUND OR NOT (mentoria_admin()
      OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO'), false)) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'AGENDADA' OR num_nonnulls(r.resumo, r.metas, r.combinado, r.cobrar, r.trava,
      r.anotacao_interna, r.humor, r.interesse_renovar) > 0 THEN
    RAISE EXCEPTION 'Só reunião agendada e sem registro pode ser excluída' USING ERRCODE = '22023';
  END IF;
  UPDATE mentoria_reunioes SET remarcada_para_id = NULL WHERE remarcada_para_id = reuniao;
  DELETE FROM mentoria_reunioes WHERE id = reuniao;
  IF r.tipo = 'IDR' THEN PERFORM mentoria_sincronizar_idr(r.inscricao_id); END IF;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (r.inscricao_id, app_user_id(), 'reuniao.excluida', ARRAY[r.tipo]);
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_ve_reuniao(text, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_edita_reuniao(text, text, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_reuniao_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_sincronizar_idr(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_reuniao_conclui_acao(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_reuniao_efeitos() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_remarcar_reuniao(uuid, uuid, timestamptz, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_excluir_reuniao(uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_ve_reuniao(text, uuid), mentoria_edita_reuniao(text, text, uuid),
  mentoria_sincronizar_idr(uuid), mentoria_reuniao_conclui_acao(uuid),
  mentoria_remarcar_reuniao(uuid, uuid, timestamptz, int), mentoria_excluir_reuniao(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_ve_reuniao(text, uuid), mentoria_edita_reuniao(text, text, uuid),
  mentoria_remarcar_reuniao(uuid, uuid, timestamptz, int), mentoria_excluir_reuniao(uuid) TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_reunioes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_reunioes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_reunioes_leitura ON mentoria_reunioes FOR SELECT
  USING (mentoria_ve_reuniao(conduzida_por, inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_reunioes_criar ON mentoria_reunioes FOR INSERT
  WITH CHECK (mentoria_edita_reuniao(conduzida_por, tipo, inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_reunioes_editar ON mentoria_reunioes FOR UPDATE
  USING (mentoria_edita_reuniao(conduzida_por, tipo, inscricao_id))
  WITH CHECK (mentoria_edita_reuniao(conduzida_por, tipo, inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_reunioes TO npac_app;
--> statement-breakpoint
GRANT UPDATE (conduzida_por, condutor_inscricao_id, duracao_min, plataforma, link, status, resumo,
  metas, combinado, cobrar, trava, anotacao_interna, humor, interesse_renovar, version, atualizado_em)
  ON mentoria_reunioes TO npac_app;
--> statement-breakpoint

-- Contatos: só acréscimo, em nome de quem está logado.
ALTER TABLE mentoria_contatos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_contatos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_contatos_leitura ON mentoria_contatos FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_contatos_criar ON mentoria_contatos FOR INSERT
  WITH CHECK (feito_por = app_user_id() AND mentoria_edita('CONTATO', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_contatos TO npac_app;
--> statement-breakpoint

-- O histórico de remarcar e excluir é escrito pelas funções: npac_app não forja.
DROP POLICY mentoria_historico_criar ON mentoria_historico;
--> statement-breakpoint
CREATE POLICY mentoria_historico_criar ON mentoria_historico FOR INSERT
  WITH CHECK (ator_id = app_user_id() AND mentoria_ve(inscricao_id)
    AND tipo NOT IN ('momento.concluido', 'momento.destravado', 'inscricao.virou_individual',
      'inscricao.pausada', 'inscricao.retomada', 'reuniao.remarcada', 'reuniao.excluida'));
