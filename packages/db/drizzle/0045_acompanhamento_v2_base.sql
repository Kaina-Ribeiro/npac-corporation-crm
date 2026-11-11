CREATE TABLE "mentoria_anotacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"autor_id" text NOT NULL,
	"texto" text NOT NULL,
	"visivel_ao_mentorado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_anotacoes_texto" CHECK (octet_length("mentoria_anotacoes"."texto") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_avaliacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"momento" text DEFAULT 'INICIAL' NOT NULL,
	"data" date,
	"nota_fe" smallint,
	"nota_saude" smallint,
	"nota_dinheiro" smallint,
	"nota_relacionamentos" smallint,
	"resultado_prova" text,
	"visivel_ao_mentorado" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_avaliacoes_unica" UNIQUE("pessoa_id","tipo","momento"),
	CONSTRAINT "mentoria_avaliacoes_tipo" CHECK ("mentoria_avaliacoes"."tipo" in ('PROVA_10_HABILIDADES', 'PILARES')),
	CONSTRAINT "mentoria_avaliacoes_momento" CHECK ("mentoria_avaliacoes"."momento" in ('INICIAL', 'MES_4', 'MES_8', 'FINAL')),
	CONSTRAINT "mentoria_avaliacoes_fe" CHECK ("mentoria_avaliacoes"."nota_fe" between 0 and 10),
	CONSTRAINT "mentoria_avaliacoes_saude" CHECK ("mentoria_avaliacoes"."nota_saude" between 0 and 10),
	CONSTRAINT "mentoria_avaliacoes_dinheiro" CHECK ("mentoria_avaliacoes"."nota_dinheiro" between 0 and 10),
	CONSTRAINT "mentoria_avaliacoes_relacionamentos" CHECK ("mentoria_avaliacoes"."nota_relacionamentos" between 0 and 10),
	CONSTRAINT "mentoria_avaliacoes_prova" CHECK (char_length("mentoria_avaliacoes"."resultado_prova") <= 200)
);
--> statement-breakpoint
CREATE TABLE "mentoria_enderecos" (
	"inscricao_id" uuid PRIMARY KEY NOT NULL,
	"endereco" text,
	"cep" text,
	"origem" text DEFAULT 'MANUAL' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_enderecos_origem" CHECK ("mentoria_enderecos"."origem" in ('FORMULARIO_CAIXA', 'MANUAL')),
	CONSTRAINT "mentoria_enderecos_endereco" CHECK (octet_length("mentoria_enderecos"."endereco") <= 400000),
	CONSTRAINT "mentoria_enderecos_cep" CHECK ("mentoria_enderecos"."cep" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "mentoria_historico" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"ator_id" text NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL,
	"tipo" text NOT NULL,
	"campos" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentoria_inscricoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"mentoria" text NOT NULL,
	"mentoria_variante" text,
	"data_compra" date,
	"data_compra_aproximada" boolean DEFAULT false NOT NULL,
	"data_idr" date,
	"inicio_jornada" date,
	"termino_previsto" date,
	"valor_centavos" bigint,
	"forma_pagamento" text,
	"status_financeiro" text,
	"status" text DEFAULT 'ONBOARDING' NOT NULL,
	"responsavel_id" text,
	"origem" text,
	"link_pasta" text,
	"link_grupo" text,
	"pme1_enviado_em" timestamp with time zone,
	"erros_pme1_concluidos_em" timestamp with time zone,
	"foto_familia_midia_id" uuid,
	"importada" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_inscricoes_tipo" CHECK ("mentoria_inscricoes"."tipo" in ('INDIVIDUAL', 'CASAL')),
	CONSTRAINT "mentoria_inscricoes_mentoria" CHECK ("mentoria_inscricoes"."mentoria" in ('RDV', '2M', '6M')),
	CONSTRAINT "mentoria_inscricoes_variante" CHECK (char_length("mentoria_inscricoes"."mentoria_variante") <= 80),
	CONSTRAINT "mentoria_inscricoes_forma" CHECK (char_length("mentoria_inscricoes"."forma_pagamento") <= 120),
	CONSTRAINT "mentoria_inscricoes_valor" CHECK ("mentoria_inscricoes"."valor_centavos" >= 0),
	CONSTRAINT "mentoria_inscricoes_financeiro" CHECK ("mentoria_inscricoes"."status_financeiro" in ('EM_DIA', 'EM_ATRASO', 'QUITADO')),
	CONSTRAINT "mentoria_inscricoes_status" CHECK ("mentoria_inscricoes"."status" in ('ONBOARDING', 'ATIVO', 'PAUSADO', 'CANCELADO', 'CONCLUIDO', 'RENOVADO')),
	CONSTRAINT "mentoria_inscricoes_origem" CHECK ("mentoria_inscricoes"."origem" in ('NACAO_MILIONARIA', 'CLUBE_DA_RIQUEZA', 'INSTAGRAM', 'INDICACAO')),
	CONSTRAINT "mentoria_inscricoes_pasta" CHECK ("mentoria_inscricoes"."link_pasta" ~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|drive\.google\.com|docs\.google\.com)(/|$)'),
	CONSTRAINT "mentoria_inscricoes_grupo" CHECK ("mentoria_inscricoes"."link_grupo" ~ '^https://chat[.]whatsapp[.]com/')
);
--> statement-breakpoint
CREATE TABLE "mentoria_legado" (
	"inscricao_id" uuid PRIMARY KEY NOT NULL,
	"dados" text NOT NULL,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_legado_dados" CHECK (octet_length("mentoria_legado"."dados") <= 2000000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_momento_inicial" (
	"inscricao_id" uuid PRIMARY KEY NOT NULL,
	"data" date,
	"recebe_centavos" bigint,
	"custo_centavos" bigint,
	"tem_dividas" boolean,
	"dividas_centavos" bigint,
	"guardado_centavos" bigint,
	"dor" text,
	"sonho" text,
	"meta" text,
	"travado_em" timestamp with time zone,
	"travado_por" text,
	"visivel_ao_mentorado" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_momento_recebe" CHECK ("mentoria_momento_inicial"."recebe_centavos" >= 0),
	CONSTRAINT "mentoria_momento_custo" CHECK ("mentoria_momento_inicial"."custo_centavos" >= 0),
	CONSTRAINT "mentoria_momento_dividas" CHECK ("mentoria_momento_inicial"."dividas_centavos" >= 0),
	CONSTRAINT "mentoria_momento_guardado" CHECK ("mentoria_momento_inicial"."guardado_centavos" >= 0),
	CONSTRAINT "mentoria_momento_dor" CHECK (octet_length("mentoria_momento_inicial"."dor") <= 400000),
	CONSTRAINT "mentoria_momento_sonho" CHECK (octet_length("mentoria_momento_inicial"."sonho") <= 400000),
	CONSTRAINT "mentoria_momento_meta" CHECK (octet_length("mentoria_momento_inicial"."meta") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_perfis" (
	"user_id" text PRIMARY KEY NOT NULL,
	"perfil" text NOT NULL,
	"admin" boolean DEFAULT false NOT NULL,
	"definido_por" text,
	"definido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_perfis_perfil" CHECK ("mentoria_perfis"."perfil" in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR'))
);
--> statement-breakpoint
CREATE TABLE "mentoria_pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"ordem" smallint NOT NULL,
	"nome" text NOT NULL,
	"nome_norm" text NOT NULL,
	"apelido" text,
	"foto_midia_id" uuid,
	"nascimento" date,
	"cidade" text,
	"uf" text,
	"whatsapp" text,
	"whatsapp_idx" text,
	"email" text,
	"email_idx" text,
	"instagram" text,
	"profissao" text,
	"ocupacao" text,
	"filhos_quantidade" smallint,
	"filhos_idades" text,
	"tecnologia" text,
	"melhor_horario" text,
	"canal_preferido" text,
	"pulseira" text,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_pessoas_ordem_unica" UNIQUE("inscricao_id","ordem"),
	CONSTRAINT "mentoria_pessoas_ordem" CHECK ("mentoria_pessoas"."ordem" in (1, 2)),
	CONSTRAINT "mentoria_pessoas_nome" CHECK (char_length("mentoria_pessoas"."nome") between 1 and 200),
	CONSTRAINT "mentoria_pessoas_uf" CHECK (char_length("mentoria_pessoas"."uf") = 2),
	CONSTRAINT "mentoria_pessoas_ocupacao" CHECK ("mentoria_pessoas"."ocupacao" in ('EMPREGADO', 'AUTONOMO', 'EMPRESARIO')),
	CONSTRAINT "mentoria_pessoas_tecnologia" CHECK ("mentoria_pessoas"."tecnologia" in ('BAIXA', 'MEDIA', 'ALTA')),
	CONSTRAINT "mentoria_pessoas_filhos" CHECK ("mentoria_pessoas"."filhos_quantidade" between 0 and 30),
	CONSTRAINT "mentoria_pessoas_whatsapp" CHECK (octet_length("mentoria_pessoas"."whatsapp") <= 400000),
	CONSTRAINT "mentoria_pessoas_email" CHECK (octet_length("mentoria_pessoas"."email") <= 400000)
);
--> statement-breakpoint
ALTER TABLE "mentoria_midia" DROP CONSTRAINT "mentoria_midia_dono";--> statement-breakpoint
ALTER TABLE "mentoria_anotacoes" ADD CONSTRAINT "mentoria_anotacoes_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_anotacoes" ADD CONSTRAINT "mentoria_anotacoes_autor_id_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_avaliacoes" ADD CONSTRAINT "mentoria_avaliacoes_pessoa_id_mentoria_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."mentoria_pessoas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_avaliacoes" ADD CONSTRAINT "mentoria_avaliacoes_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_enderecos" ADD CONSTRAINT "mentoria_enderecos_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_enderecos" ADD CONSTRAINT "mentoria_enderecos_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_historico" ADD CONSTRAINT "mentoria_historico_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_historico" ADD CONSTRAINT "mentoria_historico_ator_id_user_id_fk" FOREIGN KEY ("ator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_inscricoes" ADD CONSTRAINT "mentoria_inscricoes_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_inscricoes" ADD CONSTRAINT "mentoria_inscricoes_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_legado" ADD CONSTRAINT "mentoria_legado_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_inicial_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_inicial_travado_por_user_id_fk" FOREIGN KEY ("travado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_inicial_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_perfis" ADD CONSTRAINT "mentoria_perfis_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_perfis" ADD CONSTRAINT "mentoria_perfis_definido_por_user_id_fk" FOREIGN KEY ("definido_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_pessoas" ADD CONSTRAINT "mentoria_pessoas_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_pessoas" ADD CONSTRAINT "mentoria_pessoas_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_anotacoes_inscricao" ON "mentoria_anotacoes" USING btree ("inscricao_id");--> statement-breakpoint
CREATE INDEX "mentoria_historico_inscricao" ON "mentoria_historico" USING btree ("inscricao_id","quando");--> statement-breakpoint
CREATE INDEX "mentoria_inscricoes_responsavel" ON "mentoria_inscricoes" USING btree ("responsavel_id");--> statement-breakpoint
CREATE INDEX "mentoria_inscricoes_status_idx" ON "mentoria_inscricoes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mentoria_pessoas_inscricao" ON "mentoria_pessoas" USING btree ("inscricao_id");--> statement-breakpoint
CREATE INDEX "mentoria_pessoas_nome_norm" ON "mentoria_pessoas" USING btree ("nome_norm");--> statement-breakpoint
CREATE INDEX "mentoria_pessoas_whatsapp_idx" ON "mentoria_pessoas" USING btree ("whatsapp_idx");--> statement-breakpoint
CREATE INDEX "mentoria_pessoas_email_idx" ON "mentoria_pessoas" USING btree ("email_idx");--> statement-breakpoint
ALTER TABLE "mentoria_midia" ADD CONSTRAINT "mentoria_midia_dono" CHECK ("mentoria_midia"."dono_tipo" in ('PESSOA_FOTO', 'FOTO_FAMILIA', 'ACAO_EVIDENCIA'));
--> statement-breakpoint

-- Perfis e acesso (SPEC §3). Comparam o cargo como texto cru, nunca app_role(), que devolve HEAD
-- para DIRETOR. SECURITY DEFINER com dono npac_owner (BYPASSRLS): as policies chamam sem recursão.
CREATE FUNCTION mentoria_perfil() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT p.perfil FROM mentoria_perfis p JOIN "user" u ON u.id = p.user_id
  WHERE u.id = app_user_id() AND u.active AND u.role::text = 'ACOMPANHAMENTO'
$$;
--> statement-breakpoint
CREATE FUNCTION mentoria_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user" u LEFT JOIN mentoria_perfis p ON p.user_id = u.id
    WHERE u.id = app_user_id() AND u.active
      AND (u.role::text = 'DIRETOR' OR (u.role::text = 'ACOMPANHAMENTO' AND p.admin))
  )
$$;
--> statement-breakpoint
-- Especialista passa a ver as inscrições com reunião conduzida por ela na Tarefa 4.1.
CREATE FUNCTION mentoria_ve(inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO'), false)
$$;
--> statement-breakpoint
-- Matriz da §3. Operação em PLANO e Especialista em REUNIAO e PLANO: Tarefas 3.1 e 4.1, por linha.
CREATE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN
        area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO', 'CONTATO', 'ANOTACAO')
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO')
      WHEN 'ESPECIALISTA' THEN area = 'ANOTACAO' AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint
-- Mídia segue o dono: a foto de pessoa e a da família, a inscrição; a evidência, a Tarefa 3.1.
CREATE FUNCTION mentoria_midia_ve(tipo text, dono uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE tipo
    WHEN 'PESSOA_FOTO' THEN EXISTS (
      SELECT 1 FROM mentoria_pessoas p WHERE p.id = dono AND mentoria_ve(p.inscricao_id))
    WHEN 'FOTO_FAMILIA' THEN mentoria_ve(dono)
    ELSE mentoria_admin() OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO'), false)
  END
$$;
--> statement-breakpoint
CREATE FUNCTION mentoria_midia_edita(tipo text, dono uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE tipo
    WHEN 'PESSOA_FOTO' THEN EXISTS (
      SELECT 1 FROM mentoria_pessoas p
      WHERE p.id = dono AND mentoria_edita('INSCRICAO', p.inscricao_id))
    WHEN 'FOTO_FAMILIA' THEN mentoria_edita('INSCRICAO', dono)
    ELSE mentoria_admin() OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO'), false)
  END
$$;
--> statement-breakpoint

-- Mídia: troca mentoria_pode() pelos perfis. Mentor não vê nada até o painel (D14).
DROP POLICY mentoria_midia_acesso ON mentoria_midia;
--> statement-breakpoint
CREATE POLICY mentoria_midia_leitura ON mentoria_midia FOR SELECT
  USING (mentoria_midia_ve(dono_tipo, dono_id));
--> statement-breakpoint
CREATE POLICY mentoria_midia_escrita ON mentoria_midia FOR INSERT
  WITH CHECK (criado_por = app_user_id() AND mentoria_midia_edita(dono_tipo, dono_id));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_exigir_acesso() RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (mentoria_admin()
      OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'), false)) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
END $$;
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
  IF m.chave_objeto IS NOT NULL THEN
    INSERT INTO mentoria_midia_exclusao (chave_objeto) VALUES (m.chave_objeto);
  END IF;
END $$;
--> statement-breakpoint
DROP FUNCTION mentoria_pode();
--> statement-breakpoint

-- Travamento do momento inicial. Só as funções SECURITY DEFINER (current_user = npac_owner)
-- passam: npac_app não conclui nem destrava à mão.
CREATE FUNCTION mentoria_momento_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.travado_em IS NOT NULL OR NEW.travado_por IS NOT NULL THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.travado_em IS NOT NULL THEN
    RAISE EXCEPTION 'O momento inicial já foi concluído' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_momento_guarda BEFORE INSERT OR UPDATE ON mentoria_momento_inicial
  FOR EACH ROW EXECUTE FUNCTION mentoria_momento_guarda();
--> statement-breakpoint
CREATE FUNCTION mentoria_avaliacao_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user <> 'npac_owner' AND NEW.momento = 'INICIAL' AND EXISTS (
    SELECT 1 FROM mentoria_pessoas p
    JOIN mentoria_momento_inicial m ON m.inscricao_id = p.inscricao_id
    WHERE p.id = NEW.pessoa_id AND m.travado_em IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'O momento inicial já foi concluído' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_avaliacao_guarda BEFORE INSERT OR UPDATE ON mentoria_avaliacoes
  FOR EACH ROW EXECUTE FUNCTION mentoria_avaliacao_guarda();
--> statement-breakpoint
CREATE FUNCTION mentoria_concluir_momento(inscricao uuid) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE nova int;
BEGIN
  IF NOT mentoria_edita('MOMENTO', inscricao) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE mentoria_momento_inicial
    SET travado_em = now(), travado_por = app_user_id(), version = version + 1, atualizado_em = now()
    WHERE inscricao_id = inscricao AND travado_em IS NULL
    RETURNING version INTO nova;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preencha o momento inicial antes de concluir' USING ERRCODE = '22023';
  END IF;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo)
    VALUES (inscricao, app_user_id(), 'momento.concluido');
  RETURN nova;
END $$;
--> statement-breakpoint
CREATE FUNCTION mentoria_destravar_momento(inscricao uuid) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE nova int;
BEGIN
  IF NOT mentoria_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE mentoria_momento_inicial
    SET travado_em = NULL, travado_por = NULL, version = version + 1, atualizado_em = now()
    WHERE inscricao_id = inscricao AND travado_em IS NOT NULL
    RETURNING version INTO nova;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O momento inicial não está concluído' USING ERRCODE = '22023';
  END IF;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo)
    VALUES (inscricao, app_user_id(), 'momento.destravado');
  RETURN nova;
END $$;
--> statement-breakpoint

-- Casal vira individual: npac_app não tem DELETE, então a pessoa 2 sai por aqui, com a mídia.
CREATE FUNCTION mentoria_remover_pessoa_2(inscricao uuid) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE segunda uuid; nova int;
BEGIN
  IF NOT mentoria_edita('INSCRICAO', inscricao) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  -- A avaliação INICIAL da pessoa 2 cairia em cascata, e ela trava junto com o momento.
  IF EXISTS (SELECT 1 FROM mentoria_momento_inicial m
             WHERE m.inscricao_id = inscricao AND m.travado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'Destrave o momento inicial antes de remover a segunda pessoa'
      USING ERRCODE = '22023';
  END IF;
  SELECT id INTO segunda FROM mentoria_pessoas WHERE inscricao_id = inscricao AND ordem = 2;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta inscrição não tem uma segunda pessoa' USING ERRCODE = '22023';
  END IF;
  PERFORM mentoria_enfileirar_midia(ARRAY['PESSOA_FOTO'], ARRAY[segunda]);
  DELETE FROM mentoria_pessoas WHERE id = segunda;
  UPDATE mentoria_inscricoes SET tipo = 'INDIVIDUAL', version = version + 1, atualizado_em = now()
    WHERE id = inscricao RETURNING version INTO nova;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.virou_individual', ARRAY['tipo', 'pessoa_2']);
  RETURN nova;
END $$;
--> statement-breakpoint

-- Perfis: a tabela só se lê; quem escreve é esta função, restrita a Admin.
CREATE FUNCTION mentoria_definir_perfil(alvo text, novo_perfil text, novo_admin boolean) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT mentoria_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF novo_perfil IS NULL THEN
    DELETE FROM mentoria_perfis WHERE user_id = alvo;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "user" u WHERE u.id = alvo AND u.active AND u.role::text = 'ACOMPANHAMENTO'
  ) THEN
    RAISE EXCEPTION 'Só quem tem o cargo Acompanhamento recebe perfil' USING ERRCODE = '22023';
  END IF;
  INSERT INTO mentoria_perfis (user_id, perfil, admin, definido_por)
    VALUES (alvo, novo_perfil, novo_admin, app_user_id())
    ON CONFLICT (user_id) DO UPDATE
    SET perfil = excluded.perfil, admin = excluded.admin,
        definido_por = excluded.definido_por, definido_em = now();
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_perfil() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_admin() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_ve(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_edita(text, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_midia_ve(text, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_midia_edita(text, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_momento_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_avaliacao_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_concluir_momento(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_destravar_momento(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_remover_pessoa_2(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_definir_perfil(text, text, boolean) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_perfil(), mentoria_admin(), mentoria_ve(uuid),
  mentoria_edita(text, uuid), mentoria_midia_ve(text, uuid), mentoria_midia_edita(text, uuid),
  mentoria_concluir_momento(uuid), mentoria_destravar_momento(uuid),
  mentoria_remover_pessoa_2(uuid), mentoria_definir_perfil(text, text, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_perfil(), mentoria_admin(), mentoria_ve(uuid),
  mentoria_edita(text, uuid), mentoria_midia_ve(text, uuid), mentoria_midia_edita(text, uuid),
  mentoria_concluir_momento(uuid), mentoria_destravar_momento(uuid),
  mentoria_remover_pessoa_2(uuid), mentoria_definir_perfil(text, text, boolean) TO npac_app;
--> statement-breakpoint

-- RLS e grants. Sem DELETE para npac_app em nenhuma tabela do módulo.
ALTER TABLE mentoria_perfis ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_perfis FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_perfis_leitura ON mentoria_perfis FOR SELECT
  USING (mentoria_admin() OR user_id = app_user_id());
--> statement-breakpoint
GRANT SELECT ON mentoria_perfis TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_inscricoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_inscricoes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_inscricoes_leitura ON mentoria_inscricoes FOR SELECT USING (mentoria_ve(id));
--> statement-breakpoint
CREATE POLICY mentoria_inscricoes_criar ON mentoria_inscricoes FOR INSERT
  WITH CHECK (mentoria_edita('INSCRICAO', id));
--> statement-breakpoint
CREATE POLICY mentoria_inscricoes_editar ON mentoria_inscricoes FOR UPDATE
  USING (mentoria_edita('INSCRICAO', id)) WITH CHECK (mentoria_edita('INSCRICAO', id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_inscricoes TO npac_app;
--> statement-breakpoint
GRANT UPDATE (tipo, mentoria, mentoria_variante, data_compra, data_compra_aproximada, data_idr,
  inicio_jornada, termino_previsto, valor_centavos, forma_pagamento, status_financeiro, status,
  responsavel_id, origem, link_pasta, link_grupo, pme1_enviado_em, erros_pme1_concluidos_em,
  foto_familia_midia_id, version, atualizado_em) ON mentoria_inscricoes TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_pessoas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_pessoas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_pessoas_leitura ON mentoria_pessoas FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_pessoas_criar ON mentoria_pessoas FOR INSERT
  WITH CHECK (mentoria_edita('INSCRICAO', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_pessoas_editar ON mentoria_pessoas FOR UPDATE
  USING (mentoria_edita('INSCRICAO', inscricao_id))
  WITH CHECK (mentoria_edita('INSCRICAO', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_pessoas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (nome, nome_norm, apelido, foto_midia_id, nascimento, cidade, uf, whatsapp, whatsapp_idx,
  email, email_idx, instagram, profissao, ocupacao, filhos_quantidade, filhos_idades, tecnologia,
  melhor_horario, canal_preferido, pulseira, version, atualizado_em) ON mentoria_pessoas TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_enderecos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_enderecos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_enderecos_leitura ON mentoria_enderecos FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_enderecos_criar ON mentoria_enderecos FOR INSERT
  WITH CHECK (mentoria_edita('INSCRICAO', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_enderecos_editar ON mentoria_enderecos FOR UPDATE
  USING (mentoria_edita('INSCRICAO', inscricao_id))
  WITH CHECK (mentoria_edita('INSCRICAO', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_enderecos TO npac_app;
--> statement-breakpoint
GRANT UPDATE (endereco, cep, origem, version, atualizado_em) ON mentoria_enderecos TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_momento_inicial ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_momento_inicial FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_momento_leitura ON mentoria_momento_inicial FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_momento_criar ON mentoria_momento_inicial FOR INSERT
  WITH CHECK (mentoria_edita('MOMENTO', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_momento_editar ON mentoria_momento_inicial FOR UPDATE
  USING (mentoria_edita('MOMENTO', inscricao_id))
  WITH CHECK (mentoria_edita('MOMENTO', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_momento_inicial TO npac_app;
--> statement-breakpoint
GRANT UPDATE (data, recebe_centavos, custo_centavos, tem_dividas, dividas_centavos, guardado_centavos,
  dor, sonho, meta, visivel_ao_mentorado, version, atualizado_em) ON mentoria_momento_inicial TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_avaliacoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_avaliacoes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_avaliacoes_leitura ON mentoria_avaliacoes FOR SELECT
  USING (EXISTS (SELECT 1 FROM mentoria_pessoas p
    WHERE p.id = pessoa_id AND mentoria_ve(p.inscricao_id)));
--> statement-breakpoint
CREATE POLICY mentoria_avaliacoes_criar ON mentoria_avaliacoes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM mentoria_pessoas p
    WHERE p.id = pessoa_id AND mentoria_edita('MOMENTO', p.inscricao_id)));
--> statement-breakpoint
CREATE POLICY mentoria_avaliacoes_editar ON mentoria_avaliacoes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM mentoria_pessoas p
    WHERE p.id = pessoa_id AND mentoria_edita('MOMENTO', p.inscricao_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM mentoria_pessoas p
    WHERE p.id = pessoa_id AND mentoria_edita('MOMENTO', p.inscricao_id)));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_avaliacoes TO npac_app;
--> statement-breakpoint
GRANT UPDATE (data, nota_fe, nota_saude, nota_dinheiro, nota_relacionamentos, resultado_prova,
  visivel_ao_mentorado, version, atualizado_em) ON mentoria_avaliacoes TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_anotacoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_anotacoes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_anotacoes_leitura ON mentoria_anotacoes FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_anotacoes_criar ON mentoria_anotacoes FOR INSERT
  WITH CHECK (autor_id = app_user_id() AND mentoria_edita('ANOTACAO', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_anotacoes TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_historico ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_historico FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_historico_leitura ON mentoria_historico FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_historico_criar ON mentoria_historico FOR INSERT
  WITH CHECK (ator_id = app_user_id() AND mentoria_ve(inscricao_id)
    AND tipo NOT IN ('momento.concluido', 'momento.destravado', 'inscricao.virou_individual'));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_historico TO npac_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE mentoria_historico_id_seq TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_legado ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_legado FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_legado_admin ON mentoria_legado FOR ALL
  USING (mentoria_admin()) WITH CHECK (mentoria_admin());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_legado TO npac_app;
--> statement-breakpoint

-- Mês da jornada: uma implementação só (T6). A pausa entra na Tarefa 3.2. Mês m começa em
-- início + (m-1) meses, a mesma conta da data prevista (31/01 + 1 mês = 28/02).
CREATE FUNCTION mentoria_mes_jornada(inscricao uuid, hoje date) RETURNS int
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN i.inicio_jornada IS NULL OR hoje < i.inicio_jornada THEN NULL ELSE (
    SELECT max(m)::int FROM generate_series(1, (
      extract(year FROM age(hoje, i.inicio_jornada)) * 12
      + extract(month FROM age(hoje, i.inicio_jornada)) + 2)::int) m
    WHERE i.inicio_jornada + make_interval(months => m - 1) <= hoje
  ) END
  FROM mentoria_inscricoes i WHERE i.id = inscricao
$$;
--> statement-breakpoint
ALTER FUNCTION mentoria_mes_jornada(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_mes_jornada(uuid, date) TO npac_app;
