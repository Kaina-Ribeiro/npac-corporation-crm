-- Fila do dia mais rápida (docs/plans/desempenho.md, Fase 6). Mesmo resultado da 0053; só sai o
-- que rodava uma consulta por linha, cada uma reavaliando a RLS do módulo:
-- 1. base_envio: mentoria_onboarding_base(e.id) relia a etapa e as pausas para cada etapa. A
--    última retomada já vem em ins.retomada (o mesmo max(fim) das pausas fechadas, sob a mesma
--    RLS: pausa visível = inscrição visível), e a conta fica aqui: greatest(envio, retomada).
-- 2. FOTO_FAMILIA: mentoria_mes_jornada(ins.id, hoje) rodava para todo RDV, e ela chama
--    mentoria_dias_pausados (0051), outra consulta. Os dias parados vêm em ins.dias_parados,
--    na mesma leitura das pausas, e o mês é a mesma conta da mentoria_mes_jornada (0051). O
--    teste de equivalência compara com a versão da 0053, que chama as duas funções: se uma
--    delas mudar, ele acusa a diferença.
-- mentoria_data_ajustada (vencimento da foto) segue chamada, só nas linhas que entram na Fila.
-- Continua SECURITY INVOKER: quem vê o quê segue na RLS. Equivalência por perfil em
-- packages/db/test/fila-equivalencia.test.ts.
CREATE OR REPLACE FUNCTION mentoria_fila(agora timestamptz)
  RETURNS TABLE (chave text, tipo text, inscricao_id uuid, referencia_id uuid,
    responsavel_perfil text, responsavel_id text, vence_em timestamptz, atrasado boolean)
  LANGUAGE sql STABLE SECURITY INVOKER
  SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT mentoria_dia(agora) AS hoje),
  ins AS (
    SELECT x.id, x.mentoria, x.importada, x.criado_em, x.inicio_jornada, x.pme1_enviado_em,
      x.foto_familia_midia_id,
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
    -- do sistema nunca entram (§7).
    SELECT 'acao:' || a.id, 'ACAO', a.inscricao_id, a.id, a.responsavel_perfil,
      CASE WHEN mentoria_perfil_de(a.responsavel_id) = a.responsavel_perfil
        THEN a.responsavel_id END,
      mentoria_hora(a.data_prevista, 0),
      mentoria_acao_atrasada(a.status, a.anterior_ao_sistema, a.data_limite, d.hoje)
    FROM mentoria_acoes a JOIN ins ON ins.id = a.inscricao_id CROSS JOIN d
    WHERE a.status = 'PENDENTE' AND NOT a.anterior_ao_sistema AND a.data_prevista <= d.hoje

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
  )
  SELECT x.k, x.t, x.i, x.ref, x.perfil, x.pessoa, x.vence, x.atras
  FROM itens x
  WHERE NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f WHERE f.chave = x.k)
  ORDER BY x.atras DESC, x.vence, x.k
$$;
