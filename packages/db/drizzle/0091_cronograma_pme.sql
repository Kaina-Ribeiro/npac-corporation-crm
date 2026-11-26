CREATE TABLE "mentoria_cronograma_anteriores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"pme_numero" smallint,
	"resultado" text NOT NULL,
	"tarefa_id" uuid,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"importado_por" text,
	CONSTRAINT "mentoria_cronograma_anteriores_unico" UNIQUE("inscricao_id","item_id"),
	CONSTRAINT "mentoria_cronograma_anteriores_numero" CHECK ("mentoria_cronograma_anteriores"."pme_numero" between 1 and 12),
	CONSTRAINT "mentoria_cronograma_anteriores_resultado" CHECK ("mentoria_cronograma_anteriores"."resultado" in ('RECEBIDO', 'NAO_FEZ', 'JA_TINHA', 'PLANEJADO')),
	CONSTRAINT "mentoria_cronograma_anteriores_planejado" CHECK ("mentoria_cronograma_anteriores"."resultado" in ('RECEBIDO', 'NAO_FEZ') or ("mentoria_cronograma_anteriores"."resultado" = 'JA_TINHA') = ("mentoria_cronograma_anteriores"."pme_numero" is null))
);
--> statement-breakpoint
CREATE TABLE "mentoria_cronograma_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bloco" text NOT NULL,
	"texto" text NOT NULL,
	"texto_norm" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_cronograma_itens_texto_unico" UNIQUE("bloco","texto_norm"),
	CONSTRAINT "mentoria_cronograma_itens_bloco" CHECK ("mentoria_cronograma_itens"."bloco" in ('EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP')),
	CONSTRAINT "mentoria_cronograma_itens_texto" CHECK (char_length("mentoria_cronograma_itens"."texto") between 1 and 2000),
	CONSTRAINT "mentoria_cronograma_itens_texto_norm" CHECK (char_length("mentoria_cronograma_itens"."texto_norm") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD COLUMN "cronograma_bloco" text;--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD COLUMN "cronograma_item_id" uuid;--> statement-breakpoint
ALTER TABLE "mentoria_cronograma_anteriores" ADD CONSTRAINT "mentoria_cronograma_anteriores_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_cronograma_anteriores" ADD CONSTRAINT "mentoria_cronograma_anteriores_item_id_mentoria_cronograma_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."mentoria_cronograma_itens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_cronograma_anteriores" ADD CONSTRAINT "mentoria_cronograma_anteriores_tarefa_id_mentoria_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."mentoria_tarefas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_cronograma_anteriores_item" ON "mentoria_cronograma_anteriores" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "mentoria_cronograma_anteriores_tarefa" ON "mentoria_cronograma_anteriores" USING btree ("tarefa_id");--> statement-breakpoint
CREATE INDEX "mentoria_cronograma_itens_ordem" ON "mentoria_cronograma_itens" USING btree ("bloco","ordem");--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_cronograma_item_id_mentoria_cronograma_itens_id_fk" FOREIGN KEY ("cronograma_item_id") REFERENCES "public"."mentoria_cronograma_itens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mentoria_tarefas_cronograma_item" ON "mentoria_tarefas" USING btree ("ciclo_id","cronograma_item_id") WHERE "mentoria_tarefas"."cronograma_item_id" is not null;--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_cronograma" CHECK (("mentoria_tarefas"."origem" = 'PME') = ("mentoria_tarefas"."cronograma_bloco" is not null) and ("mentoria_tarefas"."origem" <> 'PME' or "mentoria_tarefas"."ciclo_id" is not null) and ("mentoria_tarefas"."cronograma_item_id" is null or "mentoria_tarefas"."origem" = 'PME'));--> statement-breakpoint
ALTER TABLE "mentoria_tarefas" ADD CONSTRAINT "mentoria_tarefas_cronograma_bloco" CHECK ("mentoria_tarefas"."cronograma_bloco" in ('EXPERIENCIA', 'DESAFIO', 'FILME', 'LIVRO', 'EAP'));
--> statement-breakpoint

-- NPAC-60 (Eduarda, 24/11/2026; desenho docs/superpowers/specs/2026-11-24-cronograma-design.md): o cronograma da
-- planilha (experiências, desafios, filmes, livros e EAP) mora no sistema. Banco de itens só da Admin; cada item
-- escolhido no envio do PME vira tarefa de origem PME do ciclo (2B), que a Operação cria (3A) e Admin e
-- Acompanhamento marcam; o que veio da planilha e não virou tarefa fica em mentoria_cronograma_anteriores.
-- "Já recebeu" atravessa as inscrições da mesma pessoa pelo índice cego (WhatsApp ou e-mail, C7).
-- A Fila e o push não cobram item do cronograma (C10). A Especialista não vê nada disso (C12).

-- ------------------------------------------------------------------ banco de itens
ALTER TABLE mentoria_cronograma_itens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_cronograma_itens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_cronograma_itens_leitura ON mentoria_cronograma_itens FOR SELECT USING (
  (SELECT mentoria_admin())
  OR coalesce((SELECT mentoria_perfil()) IN ('ACOMPANHAMENTO', 'OPERACAO'), false)
);
--> statement-breakpoint
CREATE POLICY mentoria_cronograma_itens_criar ON mentoria_cronograma_itens FOR INSERT
  WITH CHECK (mentoria_admin());
--> statement-breakpoint
CREATE POLICY mentoria_cronograma_itens_editar ON mentoria_cronograma_itens FOR UPDATE
  USING (mentoria_admin()) WITH CHECK (mentoria_admin());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_cronograma_itens TO npac_app;
--> statement-breakpoint
GRANT UPDATE (texto, texto_norm, ordem, ativo, version, atualizado_em) ON mentoria_cronograma_itens TO npac_app;
--> statement-breakpoint
-- Quem criou é do banco; a alteração marca a hora.
CREATE FUNCTION mentoria_cronograma_item_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.criado_por := app_user_id();
  ELSE
    NEW.atualizado_em := now();
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_cronograma_item_guarda BEFORE INSERT OR UPDATE ON mentoria_cronograma_itens
  FOR EACH ROW EXECUTE FUNCTION mentoria_cronograma_item_guarda();
--> statement-breakpoint

-- ------------------------------------------------------------------ o que veio da planilha
-- Lê quem vê a inscrição, menos a Especialista (C12). Grava só pelas funções (importação, fase 3) e pelo
-- gatilho do envio (abaixo); o npac_app só lê.
ALTER TABLE mentoria_cronograma_anteriores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_cronograma_anteriores FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_cronograma_anteriores_leitura ON mentoria_cronograma_anteriores FOR SELECT USING (
  (SELECT mentoria_ve_todas()) OR inscricao_id = ANY ((SELECT mentoria_ids_carteira())::uuid[])
);
--> statement-breakpoint
GRANT SELECT ON mentoria_cronograma_anteriores TO npac_app;
--> statement-breakpoint

-- ------------------------------------------------------------------ tarefas do cronograma
-- Tarefa de origem PME nasce no envio (área PME, como extras e encerramento: a Operação também, 3A).
-- Marcar o resultado segue mentoria_edita_tarefa (Admin e Acompanhamento; a Operação não, R3).
ALTER POLICY mentoria_tarefas_criar ON mentoria_tarefas
  WITH CHECK (
    (origem IN ('EXTRA', 'ENCERRAMENTO', 'PME') AND mentoria_edita('PME', inscricao_id))
    OR (origem = 'REUNIAO' AND mentoria_edita_tarefa(reuniao_id, inscricao_id)));
--> statement-breakpoint
-- O bloco da tarefa é o do item do banco (o "só desta pessoa" traz o próprio). Vale também para o owner.
CREATE FUNCTION mentoria_tarefa_cronograma() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.cronograma_item_id IS NOT NULL THEN
    SELECT i.bloco INTO NEW.cronograma_bloco
    FROM mentoria_cronograma_itens i WHERE i.id = NEW.cronograma_item_id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_tarefa_cronograma BEFORE INSERT ON mentoria_tarefas
  FOR EACH ROW EXECUTE FUNCTION mentoria_tarefa_cronograma();
--> statement-breakpoint
-- O item enviado liga a linha PLANEJADO da planilha (C8): ela sai das sugestões e não aparece duas vezes.
CREATE FUNCTION mentoria_tarefa_cronograma_planejado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE mentoria_cronograma_anteriores a SET tarefa_id = NEW.id
  WHERE a.inscricao_id = NEW.inscricao_id AND a.item_id = NEW.cronograma_item_id
    AND a.resultado = 'PLANEJADO' AND a.tarefa_id IS NULL;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_tarefa_cronograma_planejado AFTER INSERT ON mentoria_tarefas
  FOR EACH ROW WHEN (NEW.cronograma_item_id IS NOT NULL)
  EXECUTE FUNCTION mentoria_tarefa_cronograma_planejado();
--> statement-breakpoint

-- ------------------------------------------------------------------ funções
-- Itens que a pessoa já tem no cronograma (§6): tarefas PME com item e linhas da planilha (menos o PLANEJADO
-- que já saiu num envio), desta inscrição e das outras da mesma pessoa (WhatsApp ou e-mail igual, C7). Sob a
-- RLS de quem consulta: o que ele não vê não entra (a Especialista recebe nada).
CREATE FUNCTION mentoria_cronograma_recebidos(inscricao uuid)
  RETURNS TABLE(item_id uuid, bloco text, pme_numero smallint, resultado text, inscricao_id uuid,
    mentoria text, propria boolean)
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path = public, pg_temp
  SET jit = off
AS $$
  WITH alvo AS (
    SELECT inscricao AS id
    UNION
    SELECT o.inscricao_id FROM mentoria_pessoas p
    JOIN mentoria_pessoas o ON o.inscricao_id <> p.inscricao_id
      AND ((p.whatsapp_idx IS NOT NULL AND o.whatsapp_idx = p.whatsapp_idx)
        OR (p.email_idx IS NOT NULL AND o.email_idx = p.email_idx))
    WHERE p.inscricao_id = inscricao
  )
  SELECT t.cronograma_item_id, t.cronograma_bloco, c.numero, t.status, t.inscricao_id, i.mentoria,
    t.inscricao_id = inscricao
  FROM mentoria_tarefas t
  JOIN alvo a ON a.id = t.inscricao_id
  JOIN mentoria_ciclos c ON c.id = t.ciclo_id
  JOIN mentoria_inscricoes i ON i.id = t.inscricao_id
  WHERE t.origem = 'PME' AND t.cronograma_item_id IS NOT NULL
  UNION ALL
  SELECT x.item_id, it.bloco, x.pme_numero, x.resultado, x.inscricao_id, i.mentoria,
    x.inscricao_id = inscricao
  FROM mentoria_cronograma_anteriores x
  JOIN alvo a ON a.id = x.inscricao_id
  JOIN mentoria_cronograma_itens it ON it.id = x.item_id
  JOIN mentoria_inscricoes i ON i.id = x.inscricao_id
  WHERE x.tarefa_id IS NULL
$$;
--> statement-breakpoint
-- Tirar um item do PME em andamento (C11, engano na montagem): quem envia PME, só a tarefa PENDENTE e sem
-- comprovante. Sem a tarefa (ou invisível): P0002; sem a área PME: 42501; regra: 22023; versão: P0409.
CREATE FUNCTION mentoria_cronograma_remover(tarefa uuid, versao int) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  t record;
  aberto boolean;
BEGIN
  SELECT x.inscricao_id, x.reuniao_id, x.ciclo_id, x.origem, x.status, x.comprovante_midia_id, x.version,
      x.cronograma_bloco
    INTO t FROM mentoria_tarefas x WHERE x.id = tarefa FOR UPDATE;
  IF NOT FOUND OR NOT mentoria_ve_tarefa(t.reuniao_id, t.inscricao_id) THEN
    RAISE EXCEPTION 'Tarefa não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF NOT mentoria_edita('PME', t.inscricao_id) THEN
    RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501';
  END IF;
  IF t.origem <> 'PME' THEN
    RAISE EXCEPTION 'Só item do cronograma sai do PME' USING ERRCODE = '22023';
  END IF;
  IF t.version <> versao THEN
    RAISE EXCEPTION 'Versão desatualizada' USING ERRCODE = 'P0409';
  END IF;
  IF t.status <> 'PENDENTE' OR t.comprovante_midia_id IS NOT NULL THEN
    RAISE EXCEPTION 'Item já marcado ou com comprovante não sai do PME' USING ERRCODE = '22023';
  END IF;
  SELECT c.concluido_em IS NULL AND c.nao_concluido_em IS NULL INTO aberto
    FROM mentoria_ciclos c WHERE c.id = t.ciclo_id;
  IF NOT coalesce(aberto, false) THEN
    RAISE EXCEPTION 'Só sai item do PME em andamento' USING ERRCODE = '22023';
  END IF;
  UPDATE mentoria_cronograma_anteriores a SET tarefa_id = NULL WHERE a.tarefa_id = tarefa;
  DELETE FROM mentoria_tarefas x WHERE x.id = tarefa;
  INSERT INTO mentoria_historico (inscricao_id, ator_id, tipo, campos)
    VALUES (t.inscricao_id, app_user_id(), 'pme.cronograma_removido', ARRAY[t.cronograma_bloco]);
END $$;
--> statement-breakpoint
ALTER FUNCTION mentoria_cronograma_item_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_tarefa_cronograma() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_tarefa_cronograma_planejado() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_cronograma_recebidos(uuid) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_cronograma_remover(uuid, int) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_cronograma_item_guarda(), mentoria_tarefa_cronograma(),
  mentoria_tarefa_cronograma_planejado(), mentoria_cronograma_recebidos(uuid),
  mentoria_cronograma_remover(uuid, int) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_cronograma_recebidos(uuid), mentoria_cronograma_remover(uuid, int)
  TO npac_app;
--> statement-breakpoint

-- ------------------------------------------------------------------ Fila e push sem cobrança de item (C10)
-- Cópia da última definição (0078) com `AND t.origem <> 'PME'` no ramo COBRANCA de cada uma. O atraso do
-- PME continua no PME_ATRASADO (degraus); extras, encerramento e tarefas da reunião seguem cobrando.
CREATE OR REPLACE FUNCTION mentoria_fila(agora timestamptz)
  RETURNS TABLE (chave text, tipo text, inscricao_id uuid, referencia_id uuid,
    responsavel_perfil text, responsavel_id text, vence_em timestamptz, atrasado boolean)
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path = public, pg_temp
  SET jit = off
AS $$
  WITH d AS (SELECT mentoria_dia(agora) AS hoje),
  ins AS (
    SELECT x.id, x.mentoria, x.importada, x.criado_em, x.inicio_jornada, x.pme1_enviado_em,
      x.foto_familia_midia_id, x.status, x.responsavel_id, x.termino_previsto,
      (SELECT max(p.fim) FROM mentoria_pausas p
        WHERE p.inscricao_id = x.id AND p.fim IS NOT NULL) AS retomada,
      -- = mentoria_dias_pausados(x.id, hoje)
      (SELECT coalesce(sum(greatest(
          least(coalesce(p.fim, d.hoje), d.hoje)
            - greatest(p.inicio, coalesce(x.inicio_jornada, p.inicio)),
          0)), 0)::int
        FROM mentoria_pausas p WHERE p.inscricao_id = x.id) AS dias_parados
    FROM mentoria_inscricoes x CROSS JOIN d WHERE x.status IN ('ONBOARDING', 'ATIVO')
  ),
  et AS (
    SELECT e.*, ins.importada, ins.criado_em AS cadastro, ins.retomada,
      mentoria_dia(greatest(e.enviada_em,
        ins.retomada::timestamp AT TIME ZONE 'America/Sao_Paulo')) AS base_envio
    FROM mentoria_onboarding_etapas e JOIN ins ON ins.id = e.inscricao_id
  ),
  -- Ciclos das inscrições na Fila, com o prazo atual (segunda chance ou prazo, E16).
  cic AS (
    SELECT c.id, c.inscricao_id, c.numero, c.concluido_em, c.nao_concluido_em,
      coalesce(c.segunda_chance_ate, c.prazo) AS prazo_atual
    FROM mentoria_ciclos c JOIN ins ON ins.id = c.inscricao_id
  ),
  itens AS (
    -- Boas-vindas: inscrição cadastrada (importada não passa pelo onboarding, §7).
    SELECT 'boas-vindas:' || e.inscricao_id AS k, 'BOAS_VINDAS' AS t, e.inscricao_id AS i,
      e.id AS ref, 'OPERACAO' AS perfil, NULL::text AS pessoa,
      mentoria_hora(b.dia, 0) AS vence, d.hoje - b.dia > 3 AS atras
    FROM et e CROSS JOIN d
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(e.cadastro), e.retomada) AS dia) b
    WHERE e.etapa = 'BOAS_VINDAS' AND e.status = 'PENDENTE' AND NOT e.importada

    UNION ALL
    -- Equipe devendo o próximo passo: o anterior fechou há mais de 3 dias.
    SELECT 'passo-devido:' || e.id, 'PASSO_DEVIDO', e.inscricao_id, e.id, 'OPERACAO', NULL,
      mentoria_hora(b.dia, 0), true
    FROM et e CROSS JOIN d
    JOIN (VALUES ('GRUPOS', 'BOAS_VINDAS'), ('AQUECIMENTO', 'GRUPOS'),
      ('PME_AQUECIMENTO', 'AQUECIMENTO')) o(etapa, anterior) ON o.etapa = e.etapa
    JOIN et a ON a.inscricao_id = e.inscricao_id AND a.etapa = o.anterior
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(coalesce(a.concluida_em, a.atualizado_em)),
      e.retomada) AS dia) b
    WHERE e.status = 'PENDENTE' AND a.status IN ('CONCLUIDA', 'DISPENSADA') AND d.hoje - b.dia > 3

    UNION ALL
    -- Passo curto enviado e parado há mais de 3 dias. O PME de aquecimento corre com a Caixa.
    SELECT 'parado:' || e.id, 'PARADO', e.inscricao_id, e.id, 'OPERACAO', NULL,
      mentoria_hora(e.base_envio, 0), true
    FROM et e CROSS JOIN d
    WHERE e.etapa IN ('BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO') AND e.status = 'ENVIADA'
      AND d.hoje - e.base_envio > 3

    UNION ALL
    -- Formulário preenchido e Caixa ainda não enviada; depois de 3 dias, atrasada. Vai para o cargo
    -- Envios quando há alguém ativo nele; sem ninguém, para a Operação (NPAC-56, M4).
    SELECT 'enviar-caixa:' || c.inscricao_id, 'ENVIAR_CAIXA', c.inscricao_id, c.id,
      CASE WHEN (SELECT mentoria_tem_envios()) THEN 'ENVIOS' ELSE 'OPERACAO' END,
      NULL, mentoria_hora(b.dia, 0), d.hoje - b.dia > 3
    FROM et c CROSS JOIN d
    JOIN et bv ON bv.inscricao_id = c.inscricao_id AND bv.etapa = 'BOAS_VINDAS'
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(coalesce(bv.formulario_preenchido_em,
      bv.atualizado_em)), c.retomada) AS dia) b
    WHERE c.etapa = 'CAIXA' AND c.status = 'PENDENTE'
      AND (bv.formulario_preenchido IS TRUE OR bv.status = 'DISPENSADA')

    UNION ALL
    -- Caixa enviada há mais de 20 dias sem entrega (D15).
    SELECT 'caixa-atrasada:' || c.inscricao_id, 'CAIXA_ATRASADA', c.inscricao_id, c.id,
      'OPERACAO', NULL, mentoria_hora(c.base_envio, 0), true
    FROM et c CROSS JOIN d
    WHERE c.etapa = 'CAIXA' AND c.status = 'ENVIADA' AND d.hoje - c.base_envio > 20

    UNION ALL
    -- Caixa entregue (ou dispensada) e nenhuma IDR em aberto: a etapa IDR segue a reunião e
    -- volta a PENDENTE depois de FALTOU ou REMARCADA sem nova.
    SELECT 'agendar-idr:' || c.inscricao_id, 'AGENDAR_IDR', c.inscricao_id, r.id, 'OPERACAO',
      NULL, mentoria_hora(mentoria_dia(coalesce(c.concluida_em, c.atualizado_em)), 0), false
    FROM et c JOIN et r ON r.inscricao_id = c.inscricao_id AND r.etapa = 'IDR'
    WHERE c.etapa = 'CAIXA' AND c.status IN ('CONCLUIDA', 'DISPENSADA') AND r.status = 'PENDENTE'

    UNION ALL
    -- Dia da IDR: lembrete de manhã (sai por fila_feitos) e o link (sai com LINK_ENVIADO). O link
    -- vai também para quem conduz, se for do Acompanhamento (o Leo não recebe, F9).
    SELECT 'lembrete-idr:' || r.id, 'LEMBRETE_IDR', r.inscricao_id, r.id, 'OPERACAO', NULL,
      mentoria_hora(d.hoje, 8), false
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN d
    WHERE r.tipo = 'IDR' AND r.status IN ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO')
      AND mentoria_dia(r.inicio) = d.hoje

    UNION ALL
    SELECT 'link-idr:' || r.id, 'LINK_IDR', r.inscricao_id, r.id, 'OPERACAO',
      CASE WHEN mentoria_perfil_de(r.conduzida_por) = 'ACOMPANHAMENTO' THEN r.conduzida_por END,
      r.inicio - interval '30 minutes', agora > r.inicio
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN d
    WHERE r.tipo = 'IDR' AND r.status IN ('AGENDADA', 'CONFIRMADA')
      AND mentoria_dia(r.inicio) = d.hoje

    UNION ALL
    -- IDR realizada no sistema e o 1º PME ainda não enviado.
    SELECT 'enviar-pme1:' || ins.id, 'ENVIAR_PME1', ins.id, NULL, 'OPERACAO', NULL, idr.inicio,
      false
    FROM ins CROSS JOIN LATERAL (SELECT min(r.inicio) AS inicio FROM mentoria_reunioes r
      WHERE r.inscricao_id = ins.id AND r.tipo = 'IDR' AND r.status = 'REALIZADA') idr
    WHERE ins.pme1_enviado_em IS NULL AND idr.inicio IS NOT NULL

    UNION ALL
    -- Ação do plano a partir da data prevista; depois do limite, atrasada. As que vieram antes
    -- do sistema nunca entram (§7). FIM_PME espera o ciclo do número do mês (E21).
    SELECT 'acao:' || a.id, 'ACAO', a.inscricao_id, a.id, a.responsavel_perfil,
      CASE WHEN mentoria_perfil_de(a.responsavel_id) = a.responsavel_perfil
        THEN a.responsavel_id END,
      mentoria_hora(e.dia, 0),
      mentoria_acao_atrasada(a.status, a.anterior_ao_sistema,
        CASE WHEN a.gatilho = 'FIM_PME' THEN e.dia ELSE a.data_limite END, d.hoje)
    FROM mentoria_acoes a JOIN ins ON ins.id = a.inscricao_id CROSS JOIN d
    LEFT JOIN cic c ON a.gatilho = 'FIM_PME' AND c.inscricao_id = a.inscricao_id
      AND c.numero = a.mes
    CROSS JOIN LATERAL (SELECT mentoria_acao_data(a.gatilho, a.mes, a.data_prevista,
      c.id IS NOT NULL, c.concluido_em, c.nao_concluido_em, c.prazo_atual, d.hoje) AS dia) e
    WHERE a.status = 'PENDENTE' AND NOT a.anterior_ao_sistema
      AND (a.gatilho = 'FIM_PME' OR a.data_prevista <= d.hoje) AND e.dia <= d.hoje

    UNION ALL
    -- RDV do mês 10 ao 12 sem a foto da família (presente do mês 11).
    SELECT 'foto-familia:' || ins.id, 'FOTO_FAMILIA', ins.id, NULL, 'OPERACAO', NULL,
      mentoria_hora(mentoria_data_ajustada(ins.id, ins.inicio_jornada,
        mentoria_data_prevista(ins.inicio_jornada, 10, 0)), 0),
      m.mes > 10
    FROM ins CROSS JOIN d
    -- = mentoria_mes_jornada(ins.id, hoje): o dia de hoje sem os dias parados. O OFFSET 0 faz a
    -- conta uma vez por linha (sem ele, o BETWEEN a repetiria).
    CROSS JOIN LATERAL (SELECT d.hoje - ins.dias_parados AS efetivo) j
    CROSS JOIN LATERAL (SELECT CASE
      WHEN ins.inicio_jornada IS NULL OR j.efetivo < ins.inicio_jornada THEN NULL ELSE (
        SELECT max(g)::int FROM generate_series(1, (
          extract(year FROM age(j.efetivo, ins.inicio_jornada)) * 12
          + extract(month FROM age(j.efetivo, ins.inicio_jornada)) + 2)::int) g
        WHERE ins.inicio_jornada + make_interval(months => g - 1) <= j.efetivo
      ) END AS mes OFFSET 0) m
    WHERE ins.mentoria = 'RDV' AND ins.foto_familia_midia_id IS NULL AND m.mes BETWEEN 10 AND 12

    UNION ALL
    -- Todo dia 1º: a arte da agenda e as reuniões mensais do 6M. Ficam até alguém concluir.
    SELECT 'agenda-mes:' || to_char(d.hoje, 'YYYY-MM'), 'AGENDA_MES', NULL, NULL, 'OPERACAO',
      NULL, mentoria_hora(date_trunc('month', d.hoje)::date, 8),
      d.hoje > date_trunc('month', d.hoje)::date
    FROM d

    UNION ALL
    SELECT 'reunioes-6m:' || to_char(d.hoje, 'YYYY-MM'), 'REUNIOES_6M', NULL, NULL, 'OPERACAO',
      NULL, mentoria_hora(date_trunc('month', d.hoje)::date, 8),
      d.hoje > date_trunc('month', d.hoje)::date
    FROM d WHERE EXISTS (SELECT 1 FROM ins WHERE ins.mentoria = '6M')

    UNION ALL
    -- Reunião de hoje, com o status: Operação e quem conduz, se opera o módulo.
    SELECT 'reuniao-hoje:' || r.id, 'REUNIAO_HOJE', r.inscricao_id, r.id, 'OPERACAO',
      CASE WHEN mentoria_perfil_de(r.conduzida_por) IN ('ACOMPANHAMENTO', 'OPERACAO',
        'ESPECIALISTA') THEN r.conduzida_por END,
      r.inicio, false
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN d
    WHERE r.status <> 'REMARCADA' AND mentoria_dia(r.inicio) = d.hoje

    UNION ALL
    -- Cobrança (E17, PDF p. 10): tarefa pendente no dia do prazo, atrasada depois dele. Do
    -- responsável pela inscrição; a da reunião conduzida pela Especialista, dela.
    SELECT 'cobranca:' || t.id, 'COBRANCA', t.inscricao_id, t.id, q.perfil, q.pessoa,
      mentoria_hora(t.data_cobranca, 0), t.data_cobranca < d.hoje
    FROM mentoria_tarefas t JOIN ins ON ins.id = t.inscricao_id CROSS JOIN d
    LEFT JOIN mentoria_reunioes r ON r.id = t.reuniao_id
    CROSS JOIN LATERAL (SELECT coalesce(mentoria_perfil_de(r.conduzida_por) = 'ESPECIALISTA',
      false) AS esp) e
    CROSS JOIN LATERAL (SELECT
      CASE WHEN e.esp THEN 'ESPECIALISTA' ELSE 'ACOMPANHAMENTO' END AS perfil,
      CASE WHEN e.esp THEN r.conduzida_por
        WHEN mentoria_perfil_de(ins.responsavel_id) = 'ACOMPANHAMENTO' THEN ins.responsavel_id
      END AS pessoa) q
    WHERE t.status = 'PENDENTE' AND t.data_cobranca <= d.hoje AND t.origem <> 'PME'

    UNION ALL
    -- Semáforo amarelo ou vermelho (E18): um item por semana; "visto nesta semana" conclui.
    SELECT 'semaforo:' || s.inscricao_id || ':'
        || to_char(date_trunc('week', d.hoje::timestamp), 'YYYY-MM-DD'),
      'SEMAFORO', s.inscricao_id, NULL, 'ACOMPANHAMENTO',
      CASE WHEN mentoria_perfil_de(ins.responsavel_id) = 'ACOMPANHAMENTO'
        THEN ins.responsavel_id END,
      mentoria_hora(d.hoje, 0), s.cor = 'VERMELHO'
    FROM d CROSS JOIN LATERAL mentoria_semaforo_lote(d.hoje) s
    JOIN ins ON ins.id = s.inscricao_id
    WHERE s.cor <> 'VERDE'

    UNION ALL
    -- Próximo PME (E19): o ciclo mais recente fechou, ainda cabe outro e a jornada não terminou.
    SELECT 'enviar-pme:' || c.id, 'ENVIAR_PME', c.inscricao_id, c.id, 'OPERACAO', NULL,
      mentoria_hora(c.concluido_em, 0), false
    FROM cic c JOIN ins ON ins.id = c.inscricao_id CROSS JOIN d
    WHERE c.concluido_em IS NOT NULL AND c.numero < 12 AND ins.status = 'ATIVO'
      AND (ins.termino_previsto IS NULL OR d.hoje <= ins.termino_previsto)
      AND NOT EXISTS (SELECT 1 FROM cic n
        WHERE n.inscricao_id = c.inscricao_id AND n.numero > c.numero)

    UNION ALL
    -- Escada de atraso do PME (E20, PDF p. 19): o degrau mais alto alcançado, do prazo atual, até
    -- o contato daquele degrau ou o ciclo fechar.
    SELECT 'pme-atrasado:' || c.id || ':' || to_char(c.prazo_atual, 'YYYY-MM-DD') || ':' || g.degrau,
      'PME_ATRASADO', c.inscricao_id, c.id, 'ACOMPANHAMENTO',
      CASE WHEN mentoria_perfil_de(ins.responsavel_id) = 'ACOMPANHAMENTO'
        THEN ins.responsavel_id END,
      mentoria_hora(c.prazo_atual + g.degrau, 0), true
    FROM cic c JOIN ins ON ins.id = c.inscricao_id CROSS JOIN d
    CROSS JOIN LATERAL (SELECT CASE
      WHEN d.hoje - c.prazo_atual >= 15 THEN 15 WHEN d.hoje - c.prazo_atual >= 10 THEN 10
      WHEN d.hoje - c.prazo_atual >= 7 THEN 7 WHEN d.hoje - c.prazo_atual >= 3 THEN 3
      END AS degrau) g
    WHERE c.concluido_em IS NULL AND c.nao_concluido_em IS NULL AND g.degrau IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mentoria_contatos ct WHERE ct.ciclo_id = c.id
        AND ct.degrau = g.degrau AND ct.degrau_prazo = c.prazo_atual)

    UNION ALL
    -- Nova inscrição (NPAC-56, G4): a venda criou a inscrição sem responsável; a Admin escolhe
    -- (só Admin: SO_ADMIN em sh/mentoria/fila.ts). Sai quando ganha responsável.
    SELECT 'nova-inscricao:' || x.id, 'NOVA_INSCRICAO', x.id, NULL, 'ACOMPANHAMENTO', NULL,
      x.criado_em, false
    FROM mentoria_inscricoes x
    WHERE x.deal_id IS NOT NULL AND x.responsavel_id IS NULL AND x.status <> 'CANCELADO'

    UNION ALL
    -- Venda estornada (M7): o estorno cancelou a inscrição; da responsável (ou do perfil), até o "Visto".
    SELECT 'venda-estornada:' || x.id, 'VENDA_ESTORNADA', x.id, NULL, 'ACOMPANHAMENTO',
      CASE WHEN mentoria_perfil_de(x.responsavel_id) = 'ACOMPANHAMENTO' THEN x.responsavel_id END,
      h.quando, false
    FROM mentoria_inscricoes x
    CROSS JOIN LATERAL (SELECT max(hh.quando) AS quando FROM mentoria_historico hh
      WHERE hh.inscricao_id = x.id AND hh.tipo = 'inscricao.cancelada_pelo_estorno') h
    WHERE x.status = 'CANCELADO' AND h.quando IS NOT NULL
  )
  SELECT x.k, x.t, x.i, x.ref, x.perfil, x.pessoa, x.vence, x.atras
  FROM itens x
  WHERE NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f WHERE f.chave = x.k)
  ORDER BY x.atras DESC, x.vence, x.k
$$;
--> statement-breakpoint
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
  -- Cargo Envios ativo (NPAC-56, M6).
  env AS (SELECT mentoria_destinatarios('ENVIOS', NULL) AS ids),
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
  -- Admin do Acompanhamento (selo); sem nenhuma ativa, a Diretoria (NPAC-56).
  adm AS (
    SELECT coalesce(
      (SELECT array_agg(u.id ORDER BY u.id) FROM "user" u
        JOIN area_membros m ON m.user_id = u.id AND m.area = 'ACOMPANHAMENTO' AND m.head
        WHERE u.active),
      (SELECT array_agg(u.id ORDER BY u.id) FROM "user" u WHERE u.active AND u.mestre),
      '{}') AS ids
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
    -- Com alguém no cargo Envios (M4), ela recebe o "Tem envio para hoje" das 8h no lugar deste.
    SELECT 'enviar-caixa:' || c.inscricao_id, mentoria_hora(b.dia + 4, 8), NULL,
      CASE WHEN cardinality(env.ids) > 0 THEN '{}'::text[] ELSE op.ids END
    FROM et c CROSS JOIN op CROSS JOIN env
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
    WHERE t.status = 'PENDENTE' AND t.data_cobranca >= d.hoje AND t.origem <> 'PME'

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

    UNION ALL
    -- Nova inscrição (NPAC-56, G4): uma vez, para quem é Admin do Acompanhamento.
    SELECT 'nova-inscricao:' || x.id, x.criado_em, NULL, adm.ids
    FROM mentoria_inscricoes x CROSS JOIN adm
    WHERE x.deal_id IS NOT NULL AND x.responsavel_id IS NULL AND x.status <> 'CANCELADO'

    UNION ALL
    -- Venda estornada (M7): uma vez, para a responsável (ou o perfil), menos o "Visto".
    SELECT 'venda-estornada:' || x.id, h.quando, NULL,
      CASE WHEN x.responsavel_id = ANY (pf.acomp) THEN ARRAY[x.responsavel_id] ELSE pf.acomp_todos END
    FROM mentoria_inscricoes x CROSS JOIN pf
    CROSS JOIN LATERAL (SELECT max(hh.quando) AS quando FROM mentoria_historico hh
      WHERE hh.inscricao_id = x.id AND hh.tipo = 'inscricao.cancelada_pelo_estorno') h
    WHERE x.status = 'CANCELADO' AND h.quando IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f WHERE f.chave = 'venda-estornada:' || x.id)

    UNION ALL
    -- Envios físicos (NPAC-56, M6): às 8h, uma vez por dia, a quem tem o cargo Envios, se há algo a
    -- enviar. Vale até o fim do dia (API parada o dia inteiro não manda o de ontem).
    SELECT 'envios:' || d.hoje, mentoria_hora(d.hoje, 8), mentoria_hora(d.hoje + 1, 0), env.ids
    FROM d CROSS JOIN env
    WHERE EXISTS (SELECT 1 FROM mentoria_envios_calc(agora) c WHERE c.status = 'PREPARANDO')
  )
  SELECT av.k, av.q, av.fim, av.u FROM av
  WHERE cardinality(av.u) > 0
    AND NOT EXISTS (SELECT 1 FROM mentoria_avisos_enviados s WHERE s.chave = av.k)
$function$;
