CREATE TABLE "mentoria_acoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"plano_modelo_id" uuid NOT NULL,
	"mes" smallint NOT NULL,
	"reuniao_tipo" text,
	"foco" text NOT NULL,
	"acao" text NOT NULL,
	"itens" text[] DEFAULT '{}'::text[] NOT NULL,
	"gatilho" text NOT NULL,
	"dias_para_executar" smallint NOT NULL,
	"data_prevista" date NOT NULL,
	"data_limite" date NOT NULL,
	"responsavel_perfil" text NOT NULL,
	"responsavel_id" text,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"itens_feitos" text[] DEFAULT '{}'::text[] NOT NULL,
	"anterior_ao_sistema" boolean DEFAULT false NOT NULL,
	"feita_em" timestamp with time zone,
	"feita_por" text,
	"evidencia_link" text,
	"evidencia_midia_id" uuid,
	"observacao" text,
	"visivel_ao_mentorado" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_acoes_modelo_unica" UNIQUE("inscricao_id","plano_modelo_id"),
	CONSTRAINT "mentoria_acoes_status" CHECK ("mentoria_acoes"."status" in ('PENDENTE', 'FEITA')),
	CONSTRAINT "mentoria_acoes_gatilho" CHECK ("mentoria_acoes"."gatilho" in ('INICIO_MES', 'FIM_PME', 'FLEXIVEL')),
	CONSTRAINT "mentoria_acoes_responsavel" CHECK ("mentoria_acoes"."responsavel_perfil" in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA')),
	CONSTRAINT "mentoria_acoes_evidencia" CHECK ("mentoria_acoes"."evidencia_link" ~ '^https://'),
	CONSTRAINT "mentoria_acoes_observacao" CHECK (octet_length("mentoria_acoes"."observacao") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_plano_modelo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentoria" text NOT NULL,
	"mes" smallint NOT NULL,
	"reuniao_tipo" text,
	"foco" text NOT NULL,
	"acao" text NOT NULL,
	"itens" text[] DEFAULT '{}'::text[] NOT NULL,
	"responsavel_perfil" text NOT NULL,
	"gatilho" text DEFAULT 'INICIO_MES' NOT NULL,
	"dias_para_executar" smallint DEFAULT 0 NOT NULL,
	"segue_calendario" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_plano_mentoria" CHECK ("mentoria_plano_modelo"."mentoria" in ('RDV', '2M', '6M')),
	CONSTRAINT "mentoria_plano_mes" CHECK ("mentoria_plano_modelo"."mes" between 1 and 120),
	CONSTRAINT "mentoria_plano_reuniao" CHECK ("mentoria_plano_modelo"."reuniao_tipo" in ('IDR', 'ACOMP_2PME', 'POSICIONAMENTO', 'MENTORADO_EXPERIENTE', 'CARTOES_MILHAS', 'MENSAL_6M', 'TRIMESTRAL_2M', 'ACOMP_EMERGENCIA', 'RENOVACAO')),
	CONSTRAINT "mentoria_plano_foco" CHECK (char_length("mentoria_plano_modelo"."foco") between 1 and 120),
	CONSTRAINT "mentoria_plano_acao" CHECK (char_length("mentoria_plano_modelo"."acao") between 1 and 500),
	CONSTRAINT "mentoria_plano_responsavel" CHECK ("mentoria_plano_modelo"."responsavel_perfil" in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA')),
	CONSTRAINT "mentoria_plano_gatilho" CHECK ("mentoria_plano_modelo"."gatilho" in ('INICIO_MES', 'FIM_PME', 'FLEXIVEL')),
	CONSTRAINT "mentoria_plano_dias" CHECK ("mentoria_plano_modelo"."dias_para_executar" between 0 and 60)
);
--> statement-breakpoint
ALTER TABLE "mentoria_acoes" ADD CONSTRAINT "mentoria_acoes_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_acoes" ADD CONSTRAINT "mentoria_acoes_plano_modelo_id_mentoria_plano_modelo_id_fk" FOREIGN KEY ("plano_modelo_id") REFERENCES "public"."mentoria_plano_modelo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_acoes" ADD CONSTRAINT "mentoria_acoes_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_acoes" ADD CONSTRAINT "mentoria_acoes_feita_por_user_id_fk" FOREIGN KEY ("feita_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_plano_modelo" ADD CONSTRAINT "mentoria_plano_modelo_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_acoes_inscricao" ON "mentoria_acoes" USING btree ("inscricao_id","mes");--> statement-breakpoint
CREATE INDEX "mentoria_acoes_data" ON "mentoria_acoes" USING btree ("data_prevista");--> statement-breakpoint
CREATE INDEX "mentoria_plano_modelo_mentoria" ON "mentoria_plano_modelo" USING btree ("mentoria","mes");
--> statement-breakpoint

-- Modelo RDV: as 12 linhas do PDF. "Espera o fim do PME" vira FIM_PME, que na Fase 1 usa o
-- calendário: 25 dias depois do início do mês da jornada (suposição, a Duda ajusta). Mês 7 é flexível (D14).
INSERT INTO mentoria_plano_modelo
  (mentoria, mes, reuniao_tipo, foco, acao, itens, responsavel_perfil, gatilho, dias_para_executar, segue_calendario)
VALUES
  ('RDV', 1, NULL, 'Adaptação', 'Garantir 100% do PME; respostas rápidas e contato semanal',
    ARRAY['Check-ins semanais', '% do PME', 'Tempo de resposta'], 'ACOMPANHAMENTO', 'INICIO_MES', 0, true),
  ('RDV', 2, 'ACOMP_2PME', 'Conexão com a equipe', 'Convites individuais para as aulas ao vivo; reunião com a Duda ao fechar o 2º PME',
    ARRAY['Convites enviados', 'Presença nas aulas', 'Reunião registrada'], 'ACOMPANHAMENTO', 'FIM_PME', 25, false),
  ('RDV', 3, NULL, 'Momento mágico', 'Fim dos avisos individuais de aula; vídeo do office; experiência personalizada com o mentorado como protagonista',
    ARRAY['Vídeo enviado', 'Experiência entregue', 'Conquista "Marco 3 meses"'], 'ACOMPANHAMENTO', 'INICIO_MES', 0, true),
  ('RDV', 4, NULL, 'Reconhecimento da evolução', 'Antes do 5º PME, enviar a 1ª parte da linha do tempo (imagem ou PDF)',
    ARRAY['Linha do tempo parte 1 gerada', 'Linha do tempo parte 1 enviada'], 'ACOMPANHAMENTO', 'FIM_PME', 25, false),
  ('RDV', 5, 'POSICIONAMENTO', 'Comunicação e posicionamento', 'Reunião individual com a Manu ao fechar o PME e posicionamento personalizado',
    ARRAY['Reunião registrada', 'Posicionamento entregue'], 'ESPECIALISTA', 'FIM_PME', 25, false),
  ('RDV', 6, 'MENTORADO_EXPERIENTE', 'Conexão e inspiração', 'Conversa com um mentorado experiente; revisão de pendências',
    ARRAY['Padrinho escolhido', 'Conversa realizada', 'Pendências revisadas'], 'ACOMPANHAMENTO', 'INICIO_MES', 0, true),
  ('RDV', 7, 'CARTOES_MILHAS', 'Cartões de crédito e milhas', 'Reunião de orientação com a Duda; acompanhar os aportes diários do PME',
    ARRAY['Reunião registrada', 'Aportes acompanhados'], 'ACOMPANHAMENTO', 'FLEXIVEL', 0, true),
  ('RDV', 8, NULL, 'Evolução financeira', 'Imagem com o cálculo da evolução patrimonial com dados reais',
    ARRAY['Indicadores financeiros atualizados', 'Imagem gerada'], 'ACOMPANHAMENTO', 'FIM_PME', 25, false),
  ('RDV', 9, NULL, 'Desejo pela Villa NPAC', 'Vídeo institucional da Villa',
    ARRAY['Vídeo enviado'], 'OPERACAO', 'INICIO_MES', 0, true),
  ('RDV', 10, NULL, 'Reconhecimento da jornada', '2ª parte da linha do tempo em PDF, na mesma identidade visual',
    ARRAY['Linha do tempo parte 2 gerada', 'Linha do tempo parte 2 enviada'], 'ACOMPANHAMENTO', 'FIM_PME', 25, false),
  ('RDV', 11, NULL, 'Família e Verdadeira Riqueza', 'Presente personalizado com foto da família e a frase "Nós somos ricos de verdade"',
    ARRAY['Foto recebida', 'Presente produzido', 'Enviado', 'Entregue'], 'OPERACAO', 'INICIO_MES', 0, true),
  ('RDV', 12, 'RENOVACAO', 'Celebração e renovação', 'Após o último PME, reunião com a linha do tempo completa (antes e depois) e conversa de renovação',
    ARRAY['Reunião registrada', 'Resultado da renovação'], 'ACOMPANHAMENTO', 'FIM_PME', 25, false);
--> statement-breakpoint

-- Cadência de 2M e 6M (D17). As pulseiras depois do término ficam no modelo e nascem na renovação.
INSERT INTO mentoria_plano_modelo
  (mentoria, mes, reuniao_tipo, foco, acao, responsavel_perfil, gatilho, dias_para_executar)
SELECT '2M', m, 'TRIMESTRAL_2M', 'Reunião trimestral', 'Reunião trimestral do 2M', 'ACOMPANHAMENTO', 'INICIO_MES', 0
FROM unnest(ARRAY[1, 4, 7, 10, 13]) AS m
UNION ALL
SELECT '6M', m, 'MENSAL_6M', 'Reunião mensal', 'Reunião mensal do 6M', 'ACOMPANHAMENTO', 'INICIO_MES', 0
FROM generate_series(1, 12) AS m
UNION ALL
SELECT p.mentoria, m, NULL, 'Pulseira', 'Enviar a pulseira', 'OPERACAO', 'INICIO_MES', 0
FROM (VALUES ('2M'), ('6M')) AS p(mentoria)
CROSS JOIN unnest(ARRAY[1, 7, 13, 19, 25, 37, 61]) AS m;
--> statement-breakpoint

-- Data prevista: uma implementação só (T6). A Tarefa 3.2 faz a ajustada considerar as pausas.
CREATE FUNCTION mentoria_data_prevista(inicio date, mes int, dias int) RETURNS date
  LANGUAGE sql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
  SELECT (inicio + make_interval(months => mes - 1))::date + dias
$$;
--> statement-breakpoint
CREATE FUNCTION mentoria_data_ajustada(inscricao uuid, comeco date, base date) RETURNS date
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT base
$$;
--> statement-breakpoint
-- Atrasada é calculada: depois do limite, pendente e fora das que vieram antes do sistema.
CREATE FUNCTION mentoria_acao_atrasada(status text, anterior boolean, limite date, hoje date) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
  SELECT status = 'PENDENTE' AND NOT anterior AND hoje > limite
$$;
--> statement-breakpoint

-- Quem marca a ação (§3): Admin e Acompanhamento, todas; Operação e Especialista, as do perfil.
CREATE FUNCTION mentoria_edita_acao(responsavel text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_edita('PLANO', inscricao) OR coalesce(
    CASE mentoria_perfil()
      WHEN 'OPERACAO' THEN responsavel = 'OPERACAO'
      WHEN 'ESPECIALISTA' THEN responsavel = 'ESPECIALISTA' AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint

-- Gera as ações que faltam. Idempotente. Quem cadastra a inscrição gera (Operação fecha o
-- onboarding). Migration e seed rodam como npac_owner, sem usuário logado.
CREATE FUNCTION mentoria_gerar_acoes(inscricao uuid, hoje date) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE i record; n int;
BEGIN
  IF session_user <> 'npac_owner' AND NOT mentoria_edita('INSCRICAO', inscricao) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO i FROM mentoria_inscricoes WHERE id = inscricao;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF i.inicio_jornada IS NULL THEN RETURN 0; END IF;
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
  WHERE m.mentoria = i.mentoria AND m.ativo
    AND (i.termino_previsto IS NULL OR c.prevista <= i.termino_previsto)
  ON CONFLICT ON CONSTRAINT mentoria_acoes_modelo_unica DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
--> statement-breakpoint

-- Correção do início: refaz só as pendentes, pelo prazo copiado quando a ação nasceu.
CREATE FUNCTION mentoria_recalcular_acoes(inscricao uuid, hoje date) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE n int;
BEGIN
  IF session_user <> 'npac_owner' AND NOT mentoria_edita('PLANO', inscricao) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  UPDATE mentoria_acoes a SET
    data_prevista = c.prevista,
    data_limite = c.limite,
    anterior_ao_sistema = c.importada AND c.prevista < hoje,
    version = a.version + 1,
    atualizado_em = now()
  FROM (
    SELECT x.id, i.importada,
      mentoria_data_ajustada(inscricao, i.inicio_jornada,
        mentoria_data_prevista(i.inicio_jornada, x.mes, x.dias_para_executar)) AS prevista,
      mentoria_data_ajustada(inscricao, i.inicio_jornada,
        CASE WHEN x.gatilho = 'FLEXIVEL'
          THEN mentoria_data_prevista(i.inicio_jornada, x.mes + 1, 0) - 1
          ELSE mentoria_data_prevista(i.inicio_jornada, x.mes, x.dias_para_executar) END) AS limite
    FROM mentoria_acoes x JOIN mentoria_inscricoes i ON i.id = x.inscricao_id
    WHERE x.inscricao_id = inscricao AND x.status = 'PENDENTE' AND i.inicio_jornada IS NOT NULL
  ) c
  WHERE a.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
--> statement-breakpoint

-- Mudou de mentoria: as pendentes do plano antigo saem; as feitas ficam como registro.
CREATE FUNCTION mentoria_trocar_plano(inscricao uuid, hoje date) RETURNS int
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF session_user <> 'npac_owner' AND NOT mentoria_edita('PLANO', inscricao) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  PERFORM mentoria_enfileirar_midia(ARRAY['ACAO_EVIDENCIA'], array_agg(a.id))
    FROM mentoria_acoes a
    JOIN mentoria_inscricoes i ON i.id = a.inscricao_id
    JOIN mentoria_plano_modelo m ON m.id = a.plano_modelo_id
    WHERE a.inscricao_id = inscricao AND a.status = 'PENDENTE' AND m.mentoria <> i.mentoria
    HAVING count(*) > 0;
  DELETE FROM mentoria_acoes a
    USING mentoria_inscricoes i, mentoria_plano_modelo m
    WHERE i.id = inscricao AND a.inscricao_id = i.id AND m.id = a.plano_modelo_id
      AND a.status = 'PENDENTE' AND m.mentoria <> i.mentoria;
  RETURN mentoria_gerar_acoes(inscricao, hoje);
END $$;
--> statement-breakpoint

-- O responsável da inscrição leva as pendentes do Acompanhamento (§12). Sem version: nenhum
-- campo da tela muda, não pode virar 409 para quem está marcando um passo.
CREATE FUNCTION mentoria_acoes_seguem_responsavel() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE mentoria_acoes SET responsavel_id = NEW.responsavel_id
    WHERE inscricao_id = NEW.id AND status = 'PENDENTE'
      AND responsavel_perfil = 'ACOMPANHAMENTO';
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_acoes_seguem_responsavel AFTER UPDATE OF responsavel_id ON mentoria_inscricoes
  FOR EACH ROW WHEN (NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id)
  EXECUTE FUNCTION mentoria_acoes_seguem_responsavel();
--> statement-breakpoint

-- Quem concluiu e quando são do banco: a API não escolhe, e npac_app não forja.
CREATE FUNCTION mentoria_acao_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.feita_em := CASE WHEN NEW.status = 'FEITA' THEN now() END;
    NEW.feita_por := CASE WHEN NEW.status = 'FEITA' THEN app_user_id() END;
  ELSE
    NEW.feita_em := OLD.feita_em;
    NEW.feita_por := OLD.feita_por;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_acao_guarda BEFORE UPDATE ON mentoria_acoes
  FOR EACH ROW EXECUTE FUNCTION mentoria_acao_guarda();
--> statement-breakpoint
ALTER FUNCTION mentoria_acao_guarda() OWNER TO npac_owner;
--> statement-breakpoint

-- Evidência segue a ação.
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
  IF m.chave_objeto IS NOT NULL THEN
    INSERT INTO mentoria_midia_exclusao (chave_objeto) VALUES (m.chave_objeto);
  END IF;
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_data_prevista(date, int, int) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_data_ajustada(uuid, date, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_acao_atrasada(text, boolean, date, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_edita_acao(text, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_gerar_acoes(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_recalcular_acoes(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_trocar_plano(uuid, date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_acoes_seguem_responsavel() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_edita_acao(text, uuid), mentoria_gerar_acoes(uuid, date),
  mentoria_recalcular_acoes(uuid, date), mentoria_trocar_plano(uuid, date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_data_prevista(date, int, int),
  mentoria_data_ajustada(uuid, date, date), mentoria_acao_atrasada(text, boolean, date, date),
  mentoria_edita_acao(text, uuid), mentoria_gerar_acoes(uuid, date),
  mentoria_recalcular_acoes(uuid, date), mentoria_trocar_plano(uuid, date) TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_plano_modelo ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_plano_modelo FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_plano_leitura ON mentoria_plano_modelo FOR SELECT
  USING (mentoria_admin() OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'), false));
--> statement-breakpoint
CREATE POLICY mentoria_plano_criar ON mentoria_plano_modelo FOR INSERT
  WITH CHECK (mentoria_admin());
--> statement-breakpoint
CREATE POLICY mentoria_plano_editar ON mentoria_plano_modelo FOR UPDATE
  USING (mentoria_admin()) WITH CHECK (mentoria_admin());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_plano_modelo TO npac_app;
--> statement-breakpoint
GRANT UPDATE (mes, reuniao_tipo, foco, acao, itens, responsavel_perfil, gatilho, dias_para_executar,
  segue_calendario, ativo, version, atualizado_em) ON mentoria_plano_modelo TO npac_app;
--> statement-breakpoint

-- Ações só nascem e mudam de data pelas funções: npac_app marca, anota e anexa.
ALTER TABLE mentoria_acoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_acoes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_acoes_leitura ON mentoria_acoes FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_acoes_editar ON mentoria_acoes FOR UPDATE
  USING (mentoria_edita_acao(responsavel_perfil, inscricao_id))
  WITH CHECK (mentoria_edita_acao(responsavel_perfil, inscricao_id));
--> statement-breakpoint
GRANT SELECT ON mentoria_acoes TO npac_app;
--> statement-breakpoint
GRANT UPDATE (status, itens_feitos, feita_em, feita_por, evidencia_link, evidencia_midia_id,
  observacao, version, atualizado_em) ON mentoria_acoes TO npac_app;
--> statement-breakpoint

-- Quem já tem início ganha o plano agora. O que já passou não vira alerta: ninguém acompanhava.
SELECT mentoria_gerar_acoes(i.id, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
FROM mentoria_inscricoes i WHERE i.inicio_jornada IS NOT NULL;
--> statement-breakpoint
UPDATE mentoria_acoes SET anterior_ao_sistema = true
WHERE data_prevista < (now() AT TIME ZONE 'America/Sao_Paulo')::date;
