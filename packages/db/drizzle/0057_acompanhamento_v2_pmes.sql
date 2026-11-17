CREATE TABLE "mentoria_ciclos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"pme_id" uuid,
	"numero" smallint NOT NULL,
	"enviado_em" date NOT NULL,
	"prazo" date GENERATED ALWAYS AS (enviado_em + 30) STORED NOT NULL,
	"concluido_em" date,
	"nao_concluido_em" date,
	"anterior_ao_sistema" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_ciclos_numero_unico" UNIQUE("inscricao_id","numero"),
	CONSTRAINT "mentoria_ciclos_numero" CHECK ("mentoria_ciclos"."numero" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "mentoria_pmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" smallint NOT NULL,
	"titulo" text,
	"foco" text,
	"link_material" text,
	"atividades_extras" text[] DEFAULT '{}'::text[] NOT NULL,
	"encerramento" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_pmes_numero_unico" UNIQUE("numero"),
	CONSTRAINT "mentoria_pmes_numero" CHECK ("mentoria_pmes"."numero" between 0 and 12),
	CONSTRAINT "mentoria_pmes_titulo" CHECK (char_length("mentoria_pmes"."titulo") between 1 and 120),
	CONSTRAINT "mentoria_pmes_foco" CHECK (char_length("mentoria_pmes"."foco") between 1 and 500),
	CONSTRAINT "mentoria_pmes_link" CHECK ("mentoria_pmes"."link_material" ~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|drive\.google\.com|docs\.google\.com)(/|$)'),
	CONSTRAINT "mentoria_pmes_extras" CHECK (cardinality("mentoria_pmes"."atividades_extras") <= 20),
	CONSTRAINT "mentoria_pmes_encerramento" CHECK (char_length("mentoria_pmes"."encerramento") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "mentoria_tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"reuniao_id" uuid,
	"ciclo_id" uuid,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"descricao" text,
	"prazo" date,
	"data_cobranca" date GENERATED ALWAYS AS (prazo) STORED,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"motivo" text,
	"comprovante_midia_id" uuid,
	"cobrada_em" timestamp with time zone,
	"cobrada_por" text,
	"marcada_por_mentorado_em" timestamp with time zone,
	"visivel_ao_mentorado" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_tarefas_origem" CHECK ("mentoria_tarefas"."origem" in ('REUNIAO', 'PME', 'EXTRA', 'ENCERRAMENTO')),
	CONSTRAINT "mentoria_tarefas_status" CHECK ("mentoria_tarefas"."status" in ('PENDENTE', 'FEITA', 'PARCIAL', 'NAO_FEITA')),
	CONSTRAINT "mentoria_tarefas_reuniao_exige" CHECK ("mentoria_tarefas"."origem" <> 'REUNIAO' or ("mentoria_tarefas"."reuniao_id" is not null and "mentoria_tarefas"."prazo" is not null)),
	CONSTRAINT "mentoria_tarefas_ciclo_exige" CHECK ("mentoria_tarefas"."origem" not in ('EXTRA', 'ENCERRAMENTO') or "mentoria_tarefas"."ciclo_id" is not null),
	CONSTRAINT "mentoria_tarefas_motivo_status" CHECK ("mentoria_tarefas"."motivo" is null or "mentoria_tarefas"."status" in ('PARCIAL', 'NAO_FEITA')),
	CONSTRAINT "mentoria_tarefas_descricao" CHECK (octet_length("mentoria_tarefas"."descricao") <= 400000),
	CONSTRAINT "mentoria_tarefas_motivo" CHECK (octet_length("mentoria_tarefas"."motivo") <= 400000),
	CONSTRAINT "mentoria_tarefas_ordem" CHECK ("mentoria_tarefas"."ordem" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "mentoria_midia" DROP CONSTRAINT "mentoria_midia_dono";--> statement-breakpoint
ALTER TABLE "mentoria_ciclos" ADD CONSTRAINT "mentoria_ciclos_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_ciclos" ADD CONSTRAINT "mentoria_ciclos_pme_id_mentoria_pmes_id_fk" FOREIGN KEY ("pme_id") REFERENCES "public"."mentoria_pmes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_ciclos" ADD CONSTRAINT "mentoria_ciclos_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_reuniao_id_mentoria_reunioes_id_fk" FOREIGN KEY ("reuniao_id") REFERENCES "public"."mentoria_reunioes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_ciclo_id_mentoria_ciclos_id_fk" FOREIGN KEY ("ciclo_id") REFERENCES "public"."mentoria_ciclos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_cobrada_por_user_id_fk" FOREIGN KEY ("cobrada_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mentoria_ciclos_aberto" ON "mentoria_ciclos" USING btree ("inscricao_id") WHERE "mentoria_ciclos"."concluido_em" is null and "mentoria_ciclos"."nao_concluido_em" is null;--> statement-breakpoint
CREATE INDEX "mentoria_tarefas_inscricao" ON "mentoria_tarefas" USING btree ("inscricao_id","prazo");--> statement-breakpoint
CREATE INDEX "mentoria_tarefas_ciclo" ON "mentoria_tarefas" USING btree ("ciclo_id","ordem");--> statement-breakpoint
CREATE INDEX "mentoria_tarefas_reuniao" ON "mentoria_tarefas" USING btree ("reuniao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mentoria_tarefas_encerramento" ON "mentoria_tarefas" USING btree ("ciclo_id") WHERE "mentoria_tarefas"."origem" = 'ENCERRAMENTO';--> statement-breakpoint
ALTER TABLE "mentoria_midia" ADD CONSTRAINT "mentoria_midia_dono" CHECK ("mentoria_midia"."dono_tipo" in ('PESSOA_FOTO', 'FOTO_FAMILIA', 'ACAO_EVIDENCIA', 'TAREFA_COMPROVANTE'));
--> statement-breakpoint

-- Fase 2, Parte 1: catálogo de PMEs, ciclos e tarefas do ciclo (spec 2026-11-11, §3).

-- Catálogo inicial: só o que o PDF traz (E1). A Eduarda completa em Configurações > PMEs.
INSERT INTO mentoria_pmes (numero, atividades_extras, encerramento) VALUES
  (1, ARRAY[
    'Listar no Millionaire Book os 10 maiores erros da vida (financeiros e pessoais), com 3 possíveis soluções para cada erro',
    'Livro extra: Comece pelo Porquê'],
   'Arrancar as folhas dos erros e queimá-las como símbolo de encerramento da etapa'),
  (2, ARRAY[
    'Praticar um esporte diferente',
    'Comer uma fruta nunca provada e enviar a foto no grupo',
    'EAP extra sobre saúde mental',
    'Se terminar tudo, enviar um vídeo de no mínimo 5 minutos com o resumo do mês'],
   NULL);
--> statement-breakpoint

-- Áreas novas: PME (envio, ciclo anterior ao sistema, data de envio: Admin, Acompanhamento,
-- Operação) e TAREFA (marcar tarefas do ciclo, fechar à mão: Admin e Acompanhamento). A
-- Especialista marca as tarefas das próprias reuniões por linha (mentoria_edita_tarefa).
CREATE OR REPLACE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO',
        'CONTATO', 'ANOTACAO', 'PME', 'TAREFA')
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO', 'PME')
      WHEN 'ESPECIALISTA' THEN area IN ('ANOTACAO', 'REUNIAO') AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint

-- Tarefa: a Especialista vê e marca só as da reunião que conduziu (§2).
CREATE FUNCTION mentoria_ve_tarefa(reuniao uuid, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN true
      WHEN 'OPERACAO' THEN true
      WHEN 'ESPECIALISTA' THEN reuniao IS NOT NULL AND EXISTS (
        SELECT 1 FROM mentoria_reunioes r
        WHERE r.id = reuniao AND r.inscricao_id = inscricao AND r.conduzida_por = app_user_id())
      ELSE false
    END, false)
$$;
--> statement-breakpoint
CREATE FUNCTION mentoria_edita_tarefa(reuniao uuid, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_edita('TAREFA', inscricao) OR coalesce(
    mentoria_perfil() = 'ESPECIALISTA' AND reuniao IS NOT NULL AND EXISTS (
      SELECT 1 FROM mentoria_reunioes r
      WHERE r.id = reuniao AND r.inscricao_id = inscricao AND r.conduzida_por = app_user_id()),
    false)
$$;
--> statement-breakpoint

-- Status do ciclo (§3, S1): uma implementação só. Atraso = hoje − prazo: até 9 dias em andamento,
-- de 10 a 16 segunda chance, 17 ou mais não concluído.
CREATE FUNCTION mentoria_ciclo_status(concluido date, nao_concluido date, prazo date, hoje date)
  RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN concluido IS NOT NULL THEN 'CONCLUIDO'
    WHEN nao_concluido IS NOT NULL THEN 'NAO_CONCLUIDO'
    WHEN hoje - prazo <= 9 THEN 'EM_ANDAMENTO'
    WHEN hoje - prazo <= 16 THEN 'SEGUNDA_CHANCE'
    ELSE 'NAO_CONCLUIDO'
  END
$$;
--> statement-breakpoint

-- Ciclo: o número só cresce e quem criou é do banco. Fechar à mão só vale para ciclo sem
-- tarefa de encerramento (anterior ao sistema) e só para quem marca tarefas.
CREATE FUNCTION mentoria_ciclo_guarda() RETURNS trigger
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
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_ciclo_guarda BEFORE INSERT OR UPDATE ON mentoria_ciclos
  FOR EACH ROW EXECUTE FUNCTION mentoria_ciclo_guarda();
--> statement-breakpoint

-- Corrigir o envio move o prazo das tarefas que nasceram com o ciclo (a Operação não marca
-- tarefas, mas corrige a data: SECURITY DEFINER).
CREATE FUNCTION mentoria_ciclo_prazo_segue() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE mentoria_tarefas SET prazo = NEW.prazo, version = version + 1, atualizado_em = now()
    WHERE ciclo_id = NEW.id AND origem IN ('EXTRA', 'ENCERRAMENTO')
      AND prazo IS DISTINCT FROM NEW.prazo;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_ciclo_prazo_segue AFTER UPDATE OF enviado_em ON mentoria_ciclos
  FOR EACH ROW WHEN (NEW.enviado_em IS DISTINCT FROM OLD.enviado_em)
  EXECUTE FUNCTION mentoria_ciclo_prazo_segue();
--> statement-breakpoint

-- Tarefa: quem registrou o resultado e quando são do banco (E8). Nasce pendente.
CREATE FUNCTION mentoria_tarefa_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := app_user_id();
    NEW.status := 'PENDENTE';
    NEW.motivo := NULL;
    NEW.cobrada_em := NULL;
    NEW.cobrada_por := NULL;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.cobrada_em := CASE WHEN NEW.status <> 'PENDENTE' THEN now() END;
    NEW.cobrada_por := CASE WHEN NEW.status <> 'PENDENTE' THEN app_user_id() END;
  ELSE
    NEW.cobrada_em := OLD.cobrada_em;
    NEW.cobrada_por := OLD.cobrada_por;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_tarefa_guarda BEFORE INSERT OR UPDATE ON mentoria_tarefas
  FOR EACH ROW EXECUTE FUNCTION mentoria_tarefa_guarda();
--> statement-breakpoint

-- Até 3 tarefas por reunião (§3), com trava por reunião contra duas gravações ao mesmo tempo.
CREATE FUNCTION mentoria_tarefa_limite() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.origem <> 'REUNIAO' OR NEW.reuniao_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('mentoria_tarefas:' || NEW.reuniao_id::text));
  IF (SELECT count(*) FROM mentoria_tarefas t
      WHERE t.reuniao_id = NEW.reuniao_id AND t.origem = 'REUNIAO' AND t.id <> NEW.id) >= 3 THEN
    RAISE EXCEPTION 'Até 3 tarefas por reunião' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_tarefa_limite BEFORE INSERT OR UPDATE OF reuniao_id, origem ON mentoria_tarefas
  FOR EACH ROW EXECUTE FUNCTION mentoria_tarefa_limite();
--> statement-breakpoint

-- Encerramento (§3, E3): FEITA fecha o ciclo na mesma transação; voltar reabre. Com o PME
-- seguinte já enviado não reabre (ficariam dois ciclos abertos).
CREATE FUNCTION mentoria_tarefa_encerramento() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM mentoria_ciclos WHERE id = NEW.ciclo_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.status = 'FEITA' AND OLD.status <> 'FEITA' THEN
    UPDATE mentoria_ciclos SET
      concluido_em = greatest((now() AT TIME ZONE 'America/Sao_Paulo')::date, c.enviado_em),
      version = version + 1, atualizado_em = now()
    WHERE id = c.id;
    IF app_user_id() IS NOT NULL THEN
      INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
        VALUES (c.inscricao_id, app_user_id(), 'pme.concluido', ARRAY['pme_' || c.numero]);
    END IF;
  ELSIF OLD.status = 'FEITA' AND NEW.status <> 'FEITA' THEN
    IF EXISTS (SELECT 1 FROM mentoria_ciclos x
               WHERE x.inscricao_id = c.inscricao_id AND x.numero > c.numero) THEN
      RAISE EXCEPTION 'O PME seguinte já foi enviado' USING ERRCODE = '22023';
    END IF;
    UPDATE mentoria_ciclos SET concluido_em = NULL, version = version + 1, atualizado_em = now()
    WHERE id = c.id;
    IF app_user_id() IS NOT NULL THEN
      INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
        VALUES (c.inscricao_id, app_user_id(), 'pme.reaberto', ARRAY['pme_' || c.numero]);
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_tarefa_encerramento AFTER UPDATE OF status ON mentoria_tarefas
  FOR EACH ROW WHEN (NEW.origem = 'ENCERRAMENTO' AND NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION mentoria_tarefa_encerramento();
--> statement-breakpoint

-- Comprovante segue a tarefa.
CREATE OR REPLACE FUNCTION mentoria_midia_ve(tipo text, dono uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE tipo
    WHEN 'PESSOA_FOTO' THEN EXISTS (
      SELECT 1 FROM mentoria_pessoas p WHERE p.id = dono AND mentoria_ve(p.inscricao_id))
    WHEN 'FOTO_FAMILIA' THEN mentoria_ve(dono)
    WHEN 'ACAO_EVIDENCIA' THEN EXISTS (
      SELECT 1 FROM mentoria_acoes a WHERE a.id = dono AND mentoria_ve(a.inscricao_id))
    WHEN 'TAREFA_COMPROVANTE' THEN EXISTS (
      SELECT 1 FROM mentoria_tarefas t
      WHERE t.id = dono AND mentoria_ve_tarefa(t.reuniao_id, t.inscricao_id))
    ELSE false
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_midia_edita(tipo text, dono uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE tipo
    WHEN 'PESSOA_FOTO' THEN EXISTS (
      SELECT 1 FROM mentoria_pessoas p
      WHERE p.id = dono AND mentoria_edita('INSCRICAO', p.inscricao_id))
    WHEN 'FOTO_FAMILIA' THEN mentoria_edita('INSCRICAO', dono)
    WHEN 'ACAO_EVIDENCIA' THEN EXISTS (
      SELECT 1 FROM mentoria_acoes a
      WHERE a.id = dono AND mentoria_edita_acao(a.responsavel_perfil, a.inscricao_id))
    WHEN 'TAREFA_COMPROVANTE' THEN EXISTS (
      SELECT 1 FROM mentoria_tarefas t
      WHERE t.id = dono AND mentoria_edita_tarefa(t.reuniao_id, t.inscricao_id))
    ELSE false
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_excluir_midia(midia uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE m record;
BEGIN
  PERFORM mentoria_exigir_acesso();
  SELECT dono_tipo, dono_id, chave_objeto INTO m FROM mentoria_midia WHERE id = midia;
  IF NOT FOUND OR NOT mentoria_midia_edita(m.dono_tipo, m.dono_id) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM mentoria_midia WHERE id = midia;
  UPDATE mentoria_pessoas SET foto_midia_id = NULL WHERE foto_midia_id = midia;
  UPDATE mentoria_inscricoes SET foto_familia_midia_id = NULL WHERE foto_familia_midia_id = midia;
  UPDATE mentoria_acoes SET evidencia_midia_id = NULL WHERE evidencia_midia_id = midia;
  UPDATE mentoria_tarefas SET comprovante_midia_id = NULL, version = version + 1,
    atualizado_em = now()
  WHERE comprovante_midia_id = midia;
  IF m.chave_objeto IS NOT NULL THEN
    INSERT INTO mentoria_midia_exclusao (chave_objeto) VALUES (m.chave_objeto);
  END IF;
END $$;
--> statement-breakpoint

-- Exclusão e LGPD (0056) passam a levar os comprovantes e os textos das tarefas.
CREATE OR REPLACE FUNCTION mentoria_enfileirar_midia(inscricao uuid) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  UPDATE mentoria_pessoas SET foto_midia_id = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_inscricoes SET foto_familia_midia_id = NULL WHERE id = inscricao;
  UPDATE mentoria_acoes SET evidencia_midia_id = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_tarefas SET comprovante_midia_id = NULL WHERE inscricao_id = inscricao;
  WITH m AS (
    DELETE FROM mentoria_midia x
    WHERE (x.dono_tipo = 'PESSOA_FOTO'
        AND x.dono_id IN (SELECT p.id FROM mentoria_pessoas p WHERE p.inscricao_id = inscricao))
      OR (x.dono_tipo = 'FOTO_FAMILIA' AND x.dono_id = inscricao)
      OR (x.dono_tipo = 'ACAO_EVIDENCIA'
        AND x.dono_id IN (SELECT a.id FROM mentoria_acoes a WHERE a.inscricao_id = inscricao))
      OR (x.dono_tipo = 'TAREFA_COMPROVANTE'
        AND x.dono_id IN (SELECT t.id FROM mentoria_tarefas t WHERE t.inscricao_id = inscricao))
    RETURNING x.chave_objeto
  )
  INSERT INTO mentoria_midia_exclusao (chave_objeto)
  SELECT m.chave_objeto FROM m WHERE m.chave_objeto IS NOT NULL;
$$;
--> statement-breakpoint
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
  UPDATE mentoria_envios_fisicos SET rastreio = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_inscricoes SET link_pasta = NULL, link_grupo = NULL, importacao_chave = NULL,
    importacao_apelidos = '{}', completar_campos = '{}', version = version + 1,
    atualizado_em = now()
  WHERE id = inscricao;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.anonimizada', ARRAY['pessoas', 'contato',
      'endereco', 'momento', 'anotacoes', 'midia', 'tarefas']);
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_ve_tarefa(uuid, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_edita_tarefa(uuid, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_ciclo_status(date, date, date, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_ciclo_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_ciclo_prazo_segue() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_tarefa_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_tarefa_limite() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_tarefa_encerramento() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_ve_tarefa(uuid, uuid), mentoria_edita_tarefa(uuid, uuid),
  mentoria_ciclo_prazo_segue(), mentoria_tarefa_limite(), mentoria_tarefa_encerramento() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_ve_tarefa(uuid, uuid), mentoria_edita_tarefa(uuid, uuid),
  mentoria_ciclo_status(date, date, date, date) TO npac_app;
--> statement-breakpoint

-- Catálogo: os perfis leem (a ficha mostra título e material); só Admin escreve. Sem DELETE:
-- número que sai de uso é desativado.
ALTER TABLE mentoria_pmes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_pmes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_pmes_leitura ON mentoria_pmes FOR SELECT
  USING (mentoria_admin() OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'), false));
--> statement-breakpoint
CREATE POLICY mentoria_pmes_criar ON mentoria_pmes FOR INSERT WITH CHECK (mentoria_admin());
--> statement-breakpoint
CREATE POLICY mentoria_pmes_editar ON mentoria_pmes FOR UPDATE
  USING (mentoria_admin()) WITH CHECK (mentoria_admin());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_pmes TO npac_app;
--> statement-breakpoint
GRANT UPDATE (titulo, foco, link_material, atividades_extras, encerramento, ativo, version,
  atualizado_em) ON mentoria_pmes TO npac_app;
--> statement-breakpoint

-- Ciclos: quem vê a inscrição lê; envio e data pela área PME.
ALTER TABLE mentoria_ciclos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_ciclos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_ciclos_leitura ON mentoria_ciclos FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_ciclos_criar ON mentoria_ciclos FOR INSERT
  WITH CHECK (mentoria_edita('PME', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_ciclos_editar ON mentoria_ciclos FOR UPDATE
  USING (mentoria_edita('PME', inscricao_id)) WITH CHECK (mentoria_edita('PME', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_ciclos TO npac_app;
--> statement-breakpoint
GRANT UPDATE (enviado_em, concluido_em, nao_concluido_em, version, atualizado_em)
  ON mentoria_ciclos TO npac_app;
--> statement-breakpoint

-- Tarefas: as do ciclo nascem no envio (área PME, inclusive a Operação); as da reunião, de quem
-- marca tarefas. Marcar, motivo e comprovante por mentoria_edita_tarefa.
ALTER TABLE mentoria_tarefas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_tarefas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_tarefas_leitura ON mentoria_tarefas FOR SELECT
  USING (mentoria_ve_tarefa(reuniao_id, inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_tarefas_criar ON mentoria_tarefas FOR INSERT
  WITH CHECK (
    (origem IN ('EXTRA', 'ENCERRAMENTO') AND mentoria_edita('PME', inscricao_id))
    OR (origem IN ('REUNIAO', 'PME') AND mentoria_edita_tarefa(reuniao_id, inscricao_id)));
--> statement-breakpoint
CREATE POLICY mentoria_tarefas_editar ON mentoria_tarefas FOR UPDATE
  USING (mentoria_edita_tarefa(reuniao_id, inscricao_id))
  WITH CHECK (mentoria_edita_tarefa(reuniao_id, inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_tarefas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (status, motivo, comprovante_midia_id, cobrada_em, cobrada_por, version, atualizado_em)
  ON mentoria_tarefas TO npac_app;
--> statement-breakpoint

-- Fechar e reabrir o PME pelo encerramento só pela função: npac_app não forja.
DROP POLICY mentoria_historico_criar ON mentoria_historico;
--> statement-breakpoint
CREATE POLICY mentoria_historico_criar ON mentoria_historico FOR INSERT
  WITH CHECK (ator_id = app_user_id() AND mentoria_ve(inscricao_id)
    AND tipo NOT IN ('momento.concluido', 'momento.destravado', 'inscricao.virou_individual',
      'inscricao.pausada', 'inscricao.retomada', 'reuniao.remarcada', 'reuniao.excluida',
      'pme.concluido', 'pme.reaberto'));
