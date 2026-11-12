CREATE TABLE "mentoria_metas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"ciclo_id" uuid,
	"reuniao_id" uuid,
	"pessoa_id" uuid,
	"pilar" text,
	"descricao" text,
	"valor_alvo" numeric(14, 2),
	"valor_atual" numeric(14, 2),
	"unidade" text,
	"prazo" date,
	"visivel_ao_mentorado" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_metas_pilar" CHECK ("mentoria_metas"."pilar" in ('FE', 'SAUDE', 'DINHEIRO', 'RELACIONAMENTOS')),
	CONSTRAINT "mentoria_metas_alvo" CHECK ("mentoria_metas"."valor_alvo" > 0),
	CONSTRAINT "mentoria_metas_atual" CHECK ("mentoria_metas"."valor_atual" >= 0),
	CONSTRAINT "mentoria_metas_unidade" CHECK (char_length("mentoria_metas"."unidade") between 1 and 20),
	CONSTRAINT "mentoria_metas_descricao" CHECK (octet_length("mentoria_metas"."descricao") <= 400000)
);
--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD COLUMN "meta_id" uuid;--> statement-breakpoint
ALTER TABLE "mentoria_metas" ADD CONSTRAINT "mentoria_metas_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_metas" ADD CONSTRAINT "mentoria_metas_ciclo_id_mentoria_ciclos_id_fk" FOREIGN KEY ("ciclo_id") REFERENCES "public"."mentoria_ciclos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_metas" ADD CONSTRAINT "mentoria_metas_reuniao_id_mentoria_reunioes_id_fk" FOREIGN KEY ("reuniao_id") REFERENCES "public"."mentoria_reunioes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_metas" ADD CONSTRAINT "mentoria_metas_pessoa_id_mentoria_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."mentoria_pessoas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_metas" ADD CONSTRAINT "mentoria_metas_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_metas_inscricao" ON "mentoria_metas" USING btree ("inscricao_id","criado_em");--> statement-breakpoint
CREATE INDEX "mentoria_metas_ciclo" ON "mentoria_metas" USING btree ("ciclo_id");--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_meta_id_mentoria_metas_id_fk" FOREIGN KEY ("meta_id") REFERENCES "public"."mentoria_metas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_tarefas_meta" ON "mentoria_tarefas" USING btree ("meta_id");
--> statement-breakpoint

-- Fase 2, Parte 2: metas, tarefas da reunião e % do PME (spec 2026-11-11, §3 e §4).

-- Área nova META: Admin e Acompanhamento escrevem metas (§2). Operação só lê; a Especialista não vê.
CREATE OR REPLACE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO',
        'CONTATO', 'ANOTACAO', 'PME', 'TAREFA', 'META')
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO', 'PME')
      WHEN 'ESPECIALISTA' THEN area IN ('ANOTACAO', 'REUNIAO') AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint

-- Metas: quem vê a inscrição, menos a Especialista (só tarefas e cobrança das próprias reuniões).
CREATE FUNCTION mentoria_ve_meta(inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_ve(inscricao) AND (mentoria_admin()
    OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO'), false))
$$;
--> statement-breakpoint

-- Ciclo, reunião, pessoa e meta ligados a uma linha são da mesma inscrição. SECURITY DEFINER: a
-- Especialista não lê metas, mas a regra vale para todos.
CREATE FUNCTION mentoria_vinculos_inscricao() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE v jsonb := to_jsonb(NEW);
BEGIN
  IF (v->>'ciclo_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mentoria_ciclos c
      WHERE c.id = (v->>'ciclo_id')::uuid AND c.inscricao_id = NEW.inscricao_id)
    OR (v->>'reuniao_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mentoria_reunioes r
      WHERE r.id = (v->>'reuniao_id')::uuid AND r.inscricao_id = NEW.inscricao_id)
    OR (v->>'pessoa_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mentoria_pessoas p
      WHERE p.id = (v->>'pessoa_id')::uuid AND p.inscricao_id = NEW.inscricao_id)
    OR (v->>'meta_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mentoria_metas m
      WHERE m.id = (v->>'meta_id')::uuid AND m.inscricao_id = NEW.inscricao_id) THEN
    RAISE EXCEPTION 'Registro de outro mentorado' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_tarefa_vinculos BEFORE INSERT OR UPDATE OF ciclo_id, reuniao_id, meta_id
  ON mentoria_tarefas FOR EACH ROW EXECUTE FUNCTION mentoria_vinculos_inscricao();
--> statement-breakpoint
CREATE TRIGGER mentoria_meta_vinculos BEFORE INSERT OR UPDATE OF ciclo_id, reuniao_id, pessoa_id
  ON mentoria_metas FOR EACH ROW EXECUTE FUNCTION mentoria_vinculos_inscricao();
--> statement-breakpoint

-- Tarefa (refeita da 0057): além de quem marcou, só a tarefa da reunião muda texto, prazo e meta.
-- As do ciclo vêm do catálogo e o prazo segue o envio (gatilho do dono).
CREATE OR REPLACE FUNCTION mentoria_tarefa_guarda() RETURNS trigger
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
  IF OLD.origem <> 'REUNIAO' AND (NEW.descricao IS DISTINCT FROM OLD.descricao
      OR NEW.prazo IS DISTINCT FROM OLD.prazo OR NEW.meta_id IS DISTINCT FROM OLD.meta_id) THEN
    RAISE EXCEPTION 'Só a tarefa da reunião muda texto, prazo e meta' USING ERRCODE = '22023';
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

-- Meta: quem criou é do banco.
CREATE FUNCTION mentoria_meta_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  NEW.criado_por := app_user_id();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_meta_guarda BEFORE INSERT ON mentoria_metas
  FOR EACH ROW EXECUTE FUNCTION mentoria_meta_guarda();
--> statement-breakpoint

-- % do PME (E5): tarefas FEITA ÷ total do ciclo (PARCIAL não conta); nulo sem tarefas. Número
-- agregado, sem dado pessoal: quem vê a inscrição vê o número inteiro (a Especialista, inclusive).
-- Juntar as metas num número único está pendente com a Eduarda: cada meta mostra a própria barra.
CREATE FUNCTION mentoria_pct_tarefas(ciclo uuid) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL
    ELSE round(100.0 * count(*) FILTER (WHERE t.status = 'FEITA') / count(*))::int END
  FROM mentoria_tarefas t JOIN mentoria_ciclos c ON c.id = t.ciclo_id
  WHERE t.ciclo_id = ciclo AND mentoria_ve(c.inscricao_id)
$$;
--> statement-breakpoint
-- Reunião com tarefas ou metas não é "marcada por engano": não se exclui.
CREATE OR REPLACE FUNCTION mentoria_excluir_reuniao(reuniao uuid) RETURNS void
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
END $$;
--> statement-breakpoint

-- LGPD (0057) passa a apagar também o texto das metas.
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
  UPDATE mentoria_envios_fisicos SET rastreio = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_inscricoes SET link_pasta = NULL, link_grupo = NULL, importacao_chave = NULL,
    importacao_apelidos = '{}', completar_campos = '{}', version = version + 1,
    atualizado_em = now()
  WHERE id = inscricao;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.anonimizada', ARRAY['pessoas', 'contato',
      'endereco', 'momento', 'anotacoes', 'midia', 'tarefas', 'metas']);
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_ve_meta(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_vinculos_inscricao() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_meta_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_pct_tarefas(uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_ve_meta(uuid), mentoria_vinculos_inscricao(),
  mentoria_pct_tarefas(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_ve_meta(uuid), mentoria_pct_tarefas(uuid) TO npac_app;
--> statement-breakpoint

-- Metas: leitura por mentoria_ve_meta; escrita pela área META. Sem DELETE.
ALTER TABLE mentoria_metas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_metas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_metas_leitura ON mentoria_metas FOR SELECT
  USING (mentoria_ve_meta(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_metas_criar ON mentoria_metas FOR INSERT
  WITH CHECK (mentoria_edita('META', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_metas_editar ON mentoria_metas FOR UPDATE
  USING (mentoria_edita('META', inscricao_id)) WITH CHECK (mentoria_edita('META', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_metas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (pessoa_id, pilar, descricao, valor_alvo, valor_atual, unidade, prazo, version,
  atualizado_em) ON mentoria_metas TO npac_app;
--> statement-breakpoint

-- Tarefa da reunião: texto, prazo e meta editáveis (o gatilho recusa nas do ciclo).
GRANT UPDATE (descricao, prazo, meta_id) ON mentoria_tarefas TO npac_app;
