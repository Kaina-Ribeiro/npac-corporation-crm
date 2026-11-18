ALTER TABLE "mentoria_contatos" ADD COLUMN "ciclo_id" uuid;--> statement-breakpoint
ALTER TABLE "mentoria_contatos" ADD COLUMN "degrau" smallint;--> statement-breakpoint
ALTER TABLE "mentoria_contatos" ADD COLUMN "degrau_prazo" date;--> statement-breakpoint
ALTER TABLE "mentoria_contatos" ADD CONSTRAINT "mentoria_contatos_ciclo_id_mentoria_ciclos_id_fk" FOREIGN KEY ("ciclo_id") REFERENCES "public"."mentoria_ciclos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentoria_contatos_degrau" ON "mentoria_contatos" USING btree ("ciclo_id","degrau") WHERE "mentoria_contatos"."degrau" is not null;--> statement-breakpoint
ALTER TABLE "mentoria_contatos" ADD CONSTRAINT "mentoria_contatos_degrau" CHECK ("mentoria_contatos"."degrau" in (3, 7, 10, 15));--> statement-breakpoint
ALTER TABLE "mentoria_contatos" ADD CONSTRAINT "mentoria_contatos_degrau_prazo" CHECK (("mentoria_contatos"."degrau" is null) = ("mentoria_contatos"."degrau_prazo" is null));
--> statement-breakpoint

-- Fase 2, Parte 4 (spec 2026-11-11, E17–E22 e §6): Fila do dia com COBRANCA, SEMAFORO, ENVIAR_PME e
-- PME_ATRASADO, ação FIM_PME esperando o ciclo, push desses itens e o contato do degrau de atraso.

-- Contato de um degrau (PDF p. 19: "o sistema registra cada uma dessas ações como contato"). O ciclo
-- é da mesma inscrição, e o prazo do degrau é o prazo atual do ciclo na hora (segunda chance ou
-- prazo): com segunda chance dada, a escada recomeça do prazo dela.
CREATE FUNCTION mentoria_contato_degrau() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE c record;
BEGIN
  IF NEW.degrau IS NULL AND NEW.ciclo_id IS NULL THEN
    NEW.degrau_prazo := NULL;
    RETURN NEW;
  END IF;
  SELECT x.inscricao_id, coalesce(x.segunda_chance_ate, x.prazo) AS prazo_atual INTO c
  FROM mentoria_ciclos x WHERE x.id = NEW.ciclo_id;
  IF NEW.degrau IS NULL OR NOT FOUND OR c.inscricao_id <> NEW.inscricao_id THEN
    RAISE EXCEPTION 'O PME é de outro mentorado' USING ERRCODE = '22023';
  END IF;
  NEW.degrau_prazo := c.prazo_atual;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_contato_degrau BEFORE INSERT ON mentoria_contatos
  FOR EACH ROW EXECUTE FUNCTION mentoria_contato_degrau();
--> statement-breakpoint

-- Semáforo de toda a carteira ATIVO de uma vez (para a Fila e o push): a mesma conta da
-- mentoria_semaforo_calc (0069), sem uma chamada por inscrição. Mudou uma, mude a outra: o teste
-- db/test/fila-equivalencia.test.ts compara as duas. Interna: quem vê decide mentoria_semaforo_lote.
CREATE FUNCTION mentoria_semaforo_lote_calc(dia date)
  RETURNS TABLE (inscricao_id uuid, cor text, motivos text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  WITH x AS (
    SELECT i.id, i.inicio_jornada, s.desde,
      date_trunc('week', dia::timestamp)::date - 7 AS w1,
      date_trunc('week', dia::timestamp)::date - 14 AS w2
    FROM mentoria_inscricoes i CROSS JOIN mentoria_semaforo_inicio s
    WHERE i.status = 'ATIVO'
  ),
  ck AS (
    SELECT x.id,
      x.w1 > x.desde AND x.inicio_jornada IS NOT NULL AND x.w1 > x.inicio_jornada AS ok1,
      x.w2 > x.desde AND x.inicio_jornada IS NOT NULL AND x.w2 > x.inicio_jornada AS ok2,
      EXISTS (SELECT 1 FROM mentoria_checkins c
              WHERE c.inscricao_id = x.id AND c.semana = x.w1 AND c.respondeu) AS r1,
      EXISTS (SELECT 1 FROM mentoria_checkins c
              WHERE c.inscricao_id = x.id AND c.semana = x.w2 AND c.respondeu) AS r2
    FROM x
  ),
  tv AS (
    SELECT t.inscricao_id, t.status IN ('NAO_FEITA', 'PENDENTE') AS ruim,
      row_number() OVER (PARTITION BY t.inscricao_id
        ORDER BY t.prazo DESC, t.criado_em DESC, t.id DESC) AS n
    FROM mentoria_tarefas t JOIN x ON x.id = t.inscricao_id
    WHERE t.origem = 'REUNIAO' AND t.prazo < dia AND t.prazo >= x.desde
  ),
  tr AS (
    SELECT tv.inscricao_id, bool_or(tv.ruim) FILTER (WHERE tv.n = 1) AS r1,
      bool_or(tv.ruim) FILTER (WHERE tv.n = 2) AS r2
    FROM tv WHERE tv.n <= 2 GROUP BY tv.inscricao_id
  ),
  pm AS (
    SELECT c.inscricao_id, dia - greatest(coalesce(c.segunda_chance_ate, c.prazo), x.desde) AS atraso
    FROM mentoria_ciclos c JOIN x ON x.id = c.inscricao_id
    WHERE c.concluido_em IS NULL AND c.nao_concluido_em IS NULL
  ),
  m AS (
    SELECT x.id, array_remove(ARRAY[
      CASE WHEN ck.ok1 AND ck.ok2 AND NOT ck.r1 AND NOT ck.r2 THEN 'CHECKIN_2'
        WHEN ck.ok1 AND NOT ck.r1 THEN 'CHECKIN_1' END,
      CASE WHEN coalesce(tr.r1 AND tr.r2, false) THEN 'TAREFA_2'
        WHEN coalesce(tr.r1, false) THEN 'TAREFA_1' END,
      CASE WHEN pm.atraso >= 15 THEN 'PME_15' WHEN pm.atraso >= 7 THEN 'PME_7' END
    ]::text[], NULL) AS motivos
    FROM x JOIN ck ON ck.id = x.id
    LEFT JOIN tr ON tr.inscricao_id = x.id
    LEFT JOIN pm ON pm.inscricao_id = x.id
  )
  SELECT m.id,
    CASE WHEN m.motivos && ARRAY['CHECKIN_2', 'TAREFA_2', 'PME_15']::text[] THEN 'VERMELHO'
      WHEN cardinality(m.motivos) > 0 THEN 'AMARELO'
      ELSE 'VERDE' END,
    m.motivos
  FROM m
$$;
--> statement-breakpoint

-- Para a Fila (SECURITY INVOKER): Admin, Acompanhamento e Operação, como o semáforo (§5).
CREATE FUNCTION mentoria_semaforo_lote(dia date)
  RETURNS TABLE (inscricao_id uuid, cor text, motivos text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT s.inscricao_id, s.cor, s.motivos FROM mentoria_semaforo_lote_calc(dia) s
  WHERE (SELECT mentoria_ve_todas())
$$;
--> statement-breakpoint

-- Data em que a ação do plano entra na Fila (E21, 3A). FIM_PME espera o ciclo do número do mês: fechado,
-- vale o encerramento; aberto, espera (nula), menos o mês 2 depois de 15 dias de atraso do prazo atual
-- (PDF p. 19: "prazo máximo de 15 dias de atraso"). Sem ciclo daquele número, ou com ele não concluído
-- porque o seguinte saiu, a data da Fase 1. Sem ler tabela: a Fila passa o ciclo pelo JOIN.
CREATE FUNCTION mentoria_acao_data(gatilho text, mes int, prevista date, tem_ciclo boolean,
    concluido date, nao_concluido date, prazo_atual date, hoje date)
  RETURNS date
  LANGUAGE sql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN gatilho IS DISTINCT FROM 'FIM_PME' OR NOT tem_ciclo OR nao_concluido IS NOT NULL THEN prevista
    WHEN concluido IS NOT NULL THEN concluido
    WHEN mes = 2 AND hoje - prazo_atual >= 15 THEN prazo_atual + 15
  END
$$;
--> statement-breakpoint

-- Fila do dia (0064 + Parte 4). Continua SECURITY INVOKER e sem função por linha que releia tabela sob
-- a RLS: ciclos, tarefas e contatos entram por JOIN; o semáforo, por uma chamada só ao lote.
CREATE OR REPLACE FUNCTION mentoria_fila(agora timestamptz)
  RETURNS TABLE (chave text, tipo text, inscricao_id uuid, referencia_id uuid,
    responsavel_perfil text, responsavel_id text, vence_em timestamptz, atrasado boolean)
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path = public, pg_temp
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
    -- Formulário preenchido e Caixa ainda não enviada; depois de 3 dias, atrasada.
    SELECT 'enviar-caixa:' || c.inscricao_id, 'ENVIAR_CAIXA', c.inscricao_id, c.id, 'OPERACAO',
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
    WHERE t.status = 'PENDENTE' AND t.data_cobranca <= d.hoje

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
  )
  SELECT x.k, x.t, x.i, x.ref, x.perfil, x.pessoa, x.vence, x.atras
  FROM itens x
  WHERE NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f WHERE f.chave = x.k)
  ORDER BY x.atras DESC, x.vence, x.k
$$;
--> statement-breakpoint

-- Push da Fila (0055 + Parte 4): a ação usa a data da Fila (FIM_PME espera o ciclo); cobrança às 8h
-- do dia do prazo, só nele; vermelho às 8h (ou quando virar), uma vez por semana, menos o "visto";
-- cada degrau da escada às 8h do dia, até o próximo degrau.
CREATE OR REPLACE FUNCTION mentoria_avisos_candidatos(agora timestamptz)
  RETURNS TABLE (chave text, quando timestamptz, ate timestamptz, user_ids text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
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
    SELECT 'enviar-caixa:' || c.inscricao_id, mentoria_hora(b.dia + 4, 8), NULL, op.ids
    FROM et c CROSS JOIN op
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
      CASE WHEN mentoria_perfil_de(r.conduzida_por) = 'ESPECIALISTA'
        THEN ARRAY[r.conduzida_por]
        ELSE mentoria_destinatarios('ACOMPANHAMENTO', ins.responsavel_id) END
    FROM mentoria_tarefas t JOIN ins ON ins.id = t.inscricao_id CROSS JOIN d
    LEFT JOIN mentoria_reunioes r ON r.id = t.reuniao_id
    WHERE t.status = 'PENDENTE' AND t.data_cobranca >= d.hoje

    UNION ALL
    -- Semáforo vermelho (E18): uma vez por semana por mentorado; "visto nesta semana" não avisa.
    SELECT 'semaforo-vermelho:' || s.inscricao_id || ':' || w.semana,
      mentoria_hora(d.hoje, 8), mentoria_hora(d.hoje + 1, 0),
      mentoria_destinatarios('ACOMPANHAMENTO', ins.responsavel_id)
    FROM d CROSS JOIN LATERAL mentoria_semaforo_lote_calc(d.hoje) s
    JOIN ins ON ins.id = s.inscricao_id
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
      CASE WHEN g.prox IS NOT NULL THEN mentoria_hora(p.pa + g.prox, 0) END,
      mentoria_destinatarios('ACOMPANHAMENTO', ins.responsavel_id)
    FROM mentoria_ciclos c JOIN ins ON ins.id = c.inscricao_id
    CROSS JOIN LATERAL (SELECT coalesce(c.segunda_chance_ate, c.prazo) AS pa) p
    CROSS JOIN (VALUES (3, 7), (7, 10), (10, 15), (15, NULL::int)) g(degrau, prox)
    WHERE c.concluido_em IS NULL AND c.nao_concluido_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM mentoria_contatos ct WHERE ct.ciclo_id = c.id
        AND ct.degrau = g.degrau AND ct.degrau_prazo = p.pa)
  )
  SELECT av.k, av.q, av.fim, av.u FROM av
  WHERE cardinality(av.u) > 0
    AND NOT EXISTS (SELECT 1 FROM mentoria_avisos_enviados s WHERE s.chave = av.k)
$$;
--> statement-breakpoint
ALTER FUNCTION mentoria_contato_degrau() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_semaforo_lote_calc(date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_semaforo_lote(date) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_acao_data(text, int, date, boolean, date, date, date, date) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_semaforo_lote_calc(date), mentoria_semaforo_lote(date),
  mentoria_acao_data(text, int, date, boolean, date, date, date, date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_semaforo_lote(date),
  mentoria_acao_data(text, int, date, boolean, date, date, date, date) TO npac_app;
