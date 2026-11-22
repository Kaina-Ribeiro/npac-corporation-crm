CREATE TABLE "mentoria_conquistas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"data" date,
	"descricao" text,
	"midia_id" uuid,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_conquistas_descricao" CHECK (octet_length("mentoria_conquistas"."descricao") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_evolucao" (
	"inscricao_id" uuid PRIMARY KEY NOT NULL,
	"reserva_antes" text,
	"reserva_hoje" text,
	"renda" text,
	"saude" text,
	"investimentos" text,
	"area_atuacao" text,
	"inicial_notas" text,
	"atual_notas" text,
	"foto_inicial_midia_id" uuid,
	"foto_atual_midia_id" uuid,
	"atual_atualizado_em" timestamp with time zone,
	"atual_atualizado_por" text,
	"legado_copiado_em" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_evolucao_reserva_antes" CHECK (octet_length("mentoria_evolucao"."reserva_antes") <= 400000),
	CONSTRAINT "mentoria_evolucao_reserva_hoje" CHECK (octet_length("mentoria_evolucao"."reserva_hoje") <= 400000),
	CONSTRAINT "mentoria_evolucao_renda" CHECK (octet_length("mentoria_evolucao"."renda") <= 400000),
	CONSTRAINT "mentoria_evolucao_saude" CHECK (octet_length("mentoria_evolucao"."saude") <= 400000),
	CONSTRAINT "mentoria_evolucao_investimentos" CHECK (octet_length("mentoria_evolucao"."investimentos") <= 400000),
	CONSTRAINT "mentoria_evolucao_area" CHECK (octet_length("mentoria_evolucao"."area_atuacao") <= 400000),
	CONSTRAINT "mentoria_evolucao_inicial" CHECK (octet_length("mentoria_evolucao"."inicial_notas") <= 400000),
	CONSTRAINT "mentoria_evolucao_atual" CHECK (octet_length("mentoria_evolucao"."atual_notas") <= 400000)
);
--> statement-breakpoint
ALTER TABLE "mentoria_midia" DROP CONSTRAINT "mentoria_midia_dono";--> statement-breakpoint
ALTER TABLE "mentoria_conquistas" ADD CONSTRAINT "mentoria_conquistas_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_conquistas" ADD CONSTRAINT "mentoria_conquistas_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_evolucao" ADD CONSTRAINT "mentoria_evolucao_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_evolucao" ADD CONSTRAINT "mentoria_evolucao_atual_atualizado_por_user_id_fk" FOREIGN KEY ("atual_atualizado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_evolucao" ADD CONSTRAINT "mentoria_evolucao_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_conquistas_inscricao" ON "mentoria_conquistas" USING btree ("inscricao_id","data");--> statement-breakpoint
ALTER TABLE "mentoria_midia" ADD CONSTRAINT "mentoria_midia_dono" CHECK ("mentoria_midia"."dono_tipo" in ('PESSOA_FOTO', 'FOTO_FAMILIA', 'ACAO_EVIDENCIA', 'TAREFA_COMPROVANTE', 'EVOLUCAO_INICIAL', 'EVOLUCAO_ATUAL', 'CONQUISTA'));
--> statement-breakpoint

-- NPAC-57: aba Evolução na ficha do mentorado (spec 2026-11-21, §6). Leem Admin, Acompanhamento (com o recorte
-- "só a carteira") e Operação; a Especialista não lê nada. Escrevem Admin e Acompanhamento (área EVOLUCAO).

-- ------------------------------------------------------------------ regra de acesso
-- Por linha (API, mídia): quem vê a evolução de uma inscrição que existe.
CREATE FUNCTION mentoria_ve_evolucao(inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM mentoria_inscricoes i WHERE i.id = inscricao) AND (mentoria_admin() OR coalesce(
    mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO') AND mentoria_carteira_ok(inscricao), false))
$$;
--> statement-breakpoint
-- Área nova EVOLUCAO no perfil Acompanhamento (o resto igual à 0075).
CREATE OR REPLACE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO',
        'CONTATO', 'ANOTACAO', 'PME', 'TAREFA', 'META', 'CHECKIN', 'SEGUNDA_CHANCE', 'EVOLUCAO')
        AND mentoria_carteira_ok(inscricao)
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO', 'PME')
      WHEN 'ESPECIALISTA' THEN area IN ('ANOTACAO', 'REUNIAO') AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ mídia: donos novos
-- Fotos dos dois momentos (dono = inscrição) e mídia da conquista (dono = conquista): a regra da evolução.
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
    WHEN 'EVOLUCAO_INICIAL' THEN mentoria_ve_evolucao(dono)
    WHEN 'EVOLUCAO_ATUAL' THEN mentoria_ve_evolucao(dono)
    WHEN 'CONQUISTA' THEN EXISTS (
      SELECT 1 FROM mentoria_conquistas c WHERE c.id = dono AND mentoria_ve_evolucao(c.inscricao_id))
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
    WHEN 'EVOLUCAO_INICIAL' THEN mentoria_ve_evolucao(dono) AND mentoria_edita('EVOLUCAO', dono)
    WHEN 'EVOLUCAO_ATUAL' THEN mentoria_ve_evolucao(dono) AND mentoria_edita('EVOLUCAO', dono)
    WHEN 'CONQUISTA' THEN EXISTS (
      SELECT 1 FROM mentoria_conquistas c
      WHERE c.id = dono AND mentoria_edita('EVOLUCAO', c.inscricao_id))
    ELSE false
  END
$$;
--> statement-breakpoint
-- Apagar uma mídia solta também o apontamento das fotos e da conquista.
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
  UPDATE mentoria_evolucao SET foto_inicial_midia_id = NULL, version = version + 1, atualizado_em = now()
  WHERE foto_inicial_midia_id = midia;
  UPDATE mentoria_evolucao SET foto_atual_midia_id = NULL, version = version + 1, atualizado_em = now()
  WHERE foto_atual_midia_id = midia;
  UPDATE mentoria_conquistas SET midia_id = NULL WHERE midia_id = midia;
  IF m.chave_objeto IS NOT NULL THEN
    INSERT INTO mentoria_midia_exclusao (chave_objeto) VALUES (m.chave_objeto);
  END IF;
END $$;
--> statement-breakpoint

-- ------------------------------------------------------------------ exclusão e LGPD
-- Excluir e anonimizar a inscrição levam as fotos dos momentos e as mídias das conquistas.
CREATE OR REPLACE FUNCTION mentoria_enfileirar_midia(inscricao uuid) RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  UPDATE mentoria_pessoas SET foto_midia_id = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_inscricoes SET foto_familia_midia_id = NULL WHERE id = inscricao;
  UPDATE mentoria_acoes SET evidencia_midia_id = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_tarefas SET comprovante_midia_id = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_evolucao SET foto_inicial_midia_id = NULL, foto_atual_midia_id = NULL
  WHERE inscricao_id = inscricao;
  UPDATE mentoria_conquistas SET midia_id = NULL WHERE inscricao_id = inscricao;
  WITH m AS (
    DELETE FROM mentoria_midia x
    WHERE (x.dono_tipo = 'PESSOA_FOTO'
        AND x.dono_id IN (SELECT p.id FROM mentoria_pessoas p WHERE p.inscricao_id = inscricao))
      OR (x.dono_tipo = 'FOTO_FAMILIA' AND x.dono_id = inscricao)
      OR (x.dono_tipo = 'ACAO_EVIDENCIA'
        AND x.dono_id IN (SELECT a.id FROM mentoria_acoes a WHERE a.inscricao_id = inscricao))
      OR (x.dono_tipo = 'TAREFA_COMPROVANTE'
        AND x.dono_id IN (SELECT t.id FROM mentoria_tarefas t WHERE t.inscricao_id = inscricao))
      OR (x.dono_tipo IN ('EVOLUCAO_INICIAL', 'EVOLUCAO_ATUAL') AND x.dono_id = inscricao)
      OR (x.dono_tipo = 'CONQUISTA'
        AND x.dono_id IN (SELECT c.id FROM mentoria_conquistas c WHERE c.inscricao_id = inscricao))
    RETURNING x.chave_objeto
  )
  INSERT INTO mentoria_midia_exclusao (chave_objeto)
  SELECT m.chave_objeto FROM m WHERE m.chave_objeto IS NOT NULL;
$$;
--> statement-breakpoint
-- LGPD: zera os oito textos da evolução (a linha fica) e a descrição das conquistas (a data fica, para contagens).
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
  UPDATE mentoria_evolucao SET reserva_antes = NULL, reserva_hoje = NULL, renda = NULL, saude = NULL,
    investimentos = NULL, area_atuacao = NULL, inicial_notas = NULL, atual_notas = NULL,
    version = version + 1, atualizado_em = now()
  WHERE inscricao_id = inscricao;
  UPDATE mentoria_conquistas SET descricao = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_envios_fisicos SET rastreio = NULL WHERE inscricao_id = inscricao;
  UPDATE mentoria_inscricoes SET link_pasta = NULL, link_grupo = NULL, importacao_chave = NULL,
    importacao_apelidos = '{}', completar_campos = '{}', version = version + 1,
    atualizado_em = now()
  WHERE id = inscricao;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (inscricao, app_user_id(), 'inscricao.anonimizada', ARRAY['pessoas', 'contato',
      'endereco', 'momento', 'anotacoes', 'midia', 'tarefas', 'metas', 'checkins', 'evolucao', 'conquistas']);
END $$;
--> statement-breakpoint
-- Conquista: sem DELETE para o npac_app; só quem edita a evolução apaga, e a mídia vai para a fila.
CREATE FUNCTION mentoria_conquista_excluir(conquista uuid) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE insc uuid;
BEGIN
  SELECT c.inscricao_id INTO insc FROM mentoria_conquistas c WHERE c.id = conquista FOR UPDATE;
  IF NOT FOUND OR NOT mentoria_edita('EVOLUCAO', insc) THEN
    RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002';
  END IF;
  WITH m AS (
    DELETE FROM mentoria_midia x WHERE x.dono_tipo = 'CONQUISTA' AND x.dono_id = conquista
    RETURNING x.chave_objeto
  )
  INSERT INTO mentoria_midia_exclusao (chave_objeto)
  SELECT m.chave_objeto FROM m WHERE m.chave_objeto IS NOT NULL;
  DELETE FROM mentoria_conquistas c WHERE c.id = conquista;
END $$;
--> statement-breakpoint

-- ------------------------------------------------------------------ autoria
-- Quem criou é do banco. O rodapé "Atualizado em … por …" do momento atual também: muda só quando mudam os tópicos
-- ou a foto do momento atual, com quem está logado. A cópia do legado (npac_owner, por função) grava sem autoria.
CREATE FUNCTION mentoria_evolucao_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := app_user_id();
    NEW.legado_copiado_em := NULL;
    IF NEW.atual_notas IS NOT NULL OR NEW.foto_atual_midia_id IS NOT NULL THEN
      NEW.atual_atualizado_em := now();
      NEW.atual_atualizado_por := app_user_id();
    ELSE
      NEW.atual_atualizado_em := NULL;
      NEW.atual_atualizado_por := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.atual_notas IS DISTINCT FROM OLD.atual_notas
     OR NEW.foto_atual_midia_id IS DISTINCT FROM OLD.foto_atual_midia_id THEN
    NEW.atual_atualizado_em := now();
    NEW.atual_atualizado_por := app_user_id();
  ELSE
    NEW.atual_atualizado_em := OLD.atual_atualizado_em;
    NEW.atual_atualizado_por := OLD.atual_atualizado_por;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_evolucao_guarda BEFORE INSERT OR UPDATE ON mentoria_evolucao
  FOR EACH ROW EXECUTE FUNCTION mentoria_evolucao_guarda();
--> statement-breakpoint

-- ------------------------------------------------------------------ cópia do sistema antigo (ao subir a API)
-- Sem pessoa logada e sem abrir o legado por política: duas funções só para o npac_app. A API decifra o legado e
-- cifra cada campo com o AAD da tabela nova; o banco só grava. Lê em páginas pelo id (`depois`), para pular o que
-- ficou pendente por texto ilegível.
CREATE FUNCTION mentoria_evolucao_legado_pendentes(limite int, depois uuid DEFAULT NULL)
  RETURNS TABLE (inscricao_id uuid, dados text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT l.inscricao_id, l.dados
  FROM mentoria_legado l
  LEFT JOIN mentoria_evolucao e ON e.inscricao_id = l.inscricao_id
  WHERE e.legado_copiado_em IS NULL AND (depois IS NULL OR l.inscricao_id > depois)
  ORDER BY l.inscricao_id
  LIMIT greatest(limite, 0)
$$;
--> statement-breakpoint
-- Uma vez por inscrição (trava a inscrição; já copiada = false). Completa só campo vazio (nunca sobrescreve o que a
-- equipe escreveu) e insere as conquistas `[{id, data, descricao}]`, já cifradas. Sem histórico (a cópia não tem
-- pessoa; `mentoria_historico.ator_id` é obrigatório) e sem autoria.
CREATE FUNCTION mentoria_evolucao_legado_gravar(inscricao uuid, p_reserva_antes text, p_reserva_hoje text,
  p_renda text, p_saude text, p_investimentos text, p_area_atuacao text, p_inicial_notas text,
  p_atual_notas text, conquistas jsonb) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM mentoria_inscricoes i WHERE i.id = inscricao FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM mentoria_evolucao e
             WHERE e.inscricao_id = inscricao AND e.legado_copiado_em IS NOT NULL) THEN
    RETURN false;
  END IF;
  INSERT INTO mentoria_evolucao AS e (inscricao_id, reserva_antes, reserva_hoje, renda, saude, investimentos,
    area_atuacao, inicial_notas, atual_notas, legado_copiado_em)
  VALUES (inscricao, p_reserva_antes, p_reserva_hoje, p_renda, p_saude, p_investimentos, p_area_atuacao,
    p_inicial_notas, p_atual_notas, now())
  ON CONFLICT (inscricao_id) DO UPDATE SET
    reserva_antes = coalesce(e.reserva_antes, excluded.reserva_antes),
    reserva_hoje = coalesce(e.reserva_hoje, excluded.reserva_hoje),
    renda = coalesce(e.renda, excluded.renda),
    saude = coalesce(e.saude, excluded.saude),
    investimentos = coalesce(e.investimentos, excluded.investimentos),
    area_atuacao = coalesce(e.area_atuacao, excluded.area_atuacao),
    inicial_notas = coalesce(e.inicial_notas, excluded.inicial_notas),
    atual_notas = coalesce(e.atual_notas, excluded.atual_notas),
    legado_copiado_em = now(),
    version = e.version + 1,
    atualizado_em = now();
  INSERT INTO mentoria_conquistas (id, inscricao_id, data, descricao)
  SELECT coalesce((c->>'id')::uuid, gen_random_uuid()), inscricao, (c->>'data')::date, c->>'descricao'
  FROM jsonb_array_elements(coalesce(conquistas, '[]'::jsonb)) AS c;
  RETURN true;
END $$;
--> statement-breakpoint

ALTER FUNCTION mentoria_ve_evolucao(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_conquista_excluir(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_evolucao_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_evolucao_legado_pendentes(int, uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_evolucao_legado_gravar(uuid, text, text, text, text, text, text, text, text, jsonb)
  OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_ve_evolucao(uuid), mentoria_conquista_excluir(uuid),
  mentoria_evolucao_legado_pendentes(int, uuid),
  mentoria_evolucao_legado_gravar(uuid, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_ve_evolucao(uuid), mentoria_conquista_excluir(uuid),
  mentoria_evolucao_legado_pendentes(int, uuid),
  mentoria_evolucao_legado_gravar(uuid, text, text, text, text, text, text, text, text, jsonb) TO npac_app;
--> statement-breakpoint

-- ------------------------------------------------------------------ RLS
-- Leitura sem função por linha (0061): quem vê todas, ou a inscrição na carteira. Nunca mentoria_ids_visiveis(), que
-- inclui as inscrições da Especialista.
ALTER TABLE mentoria_evolucao ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_evolucao FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_evolucao_leitura ON mentoria_evolucao FOR SELECT USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
);
--> statement-breakpoint
CREATE POLICY mentoria_evolucao_criar ON mentoria_evolucao FOR INSERT
  WITH CHECK (mentoria_edita('EVOLUCAO', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_evolucao_editar ON mentoria_evolucao FOR UPDATE
  USING (mentoria_edita('EVOLUCAO', inscricao_id)) WITH CHECK (mentoria_edita('EVOLUCAO', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_evolucao TO npac_app;
--> statement-breakpoint
GRANT UPDATE (reserva_antes, reserva_hoje, renda, saude, investimentos, area_atuacao, inicial_notas, atual_notas,
  foto_inicial_midia_id, foto_atual_midia_id, atual_atualizado_em, atual_atualizado_por, version, atualizado_em)
  ON mentoria_evolucao TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_conquistas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_conquistas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_conquistas_leitura ON mentoria_conquistas FOR SELECT USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
);
--> statement-breakpoint
CREATE POLICY mentoria_conquistas_criar ON mentoria_conquistas FOR INSERT
  WITH CHECK (criado_por = app_user_id() AND mentoria_edita('EVOLUCAO', inscricao_id));
--> statement-breakpoint
-- Texto e data não mudam; só a mídia é apontada depois do envio (controlador de mídia).
CREATE POLICY mentoria_conquistas_midia ON mentoria_conquistas FOR UPDATE
  USING (mentoria_edita('EVOLUCAO', inscricao_id)) WITH CHECK (mentoria_edita('EVOLUCAO', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_conquistas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (midia_id) ON mentoria_conquistas TO npac_app;
