CREATE TABLE "mentoria_avisos_enviados" (
	"chave" text PRIMARY KEY NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
-- Ninguém do app lê ou grava direto: só as funções do despertador (SECURITY DEFINER).
ALTER TABLE mentoria_avisos_enviados ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_avisos_enviados FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Quem recebe o push de um item: a pessoa, se opera o módulo com aquele perfil; senão, todos
-- do perfil (responsável desativado ou sem perfil cai no perfil, §5).
CREATE FUNCTION mentoria_destinatarios(alvo_perfil text, alvo text) RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN alvo IS NOT NULL AND mentoria_perfil_de(alvo) = alvo_perfil THEN ARRAY[alvo]
    ELSE coalesce((SELECT array_agg(u.id ORDER BY u.id) FROM "user" u
      JOIN mentoria_perfis mp ON mp.user_id = u.id
      WHERE u.active AND u.role::text = 'ACOMPANHAMENTO' AND mp.perfil = alvo_perfil), '{}')
  END
$$;
--> statement-breakpoint

-- Os avisos da Fila que vão ao celular (§5, coluna "Push"), com o horário e a validade, sem os
-- já enviados. Só ONBOARDING e ATIVO: pausado e cancelado não recebem (D15). "8h" é Brasília.
-- Alertas valem enquanto o item existir; os do dia (ação, IDR, dia 1º) só no próprio dia, para
-- a API parada não acordar ninguém por um aviso velho.
CREATE FUNCTION mentoria_avisos_candidatos(agora timestamptz)
  RETURNS TABLE (chave text, quando timestamptz, ate timestamptz, user_ids text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  WITH d AS (SELECT mentoria_dia(agora) AS hoje),
  ins AS (
    SELECT x.id, x.mentoria,
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
    -- Ação do plano: às 8h do dia previsto, para o responsável (ou o perfil). As que vieram
    -- antes do sistema não avisam (§7).
    SELECT 'acao:' || a.id, mentoria_hora(a.data_prevista, 8), mentoria_hora(a.data_prevista + 1, 0),
      mentoria_destinatarios(a.responsavel_perfil, a.responsavel_id)
    FROM mentoria_acoes a JOIN ins ON ins.id = a.inscricao_id
    WHERE a.status = 'PENDENTE' AND NOT a.anterior_ao_sistema

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
  )
  SELECT av.k, av.q, av.fim, av.u FROM av
  WHERE cardinality(av.u) > 0
    AND NOT EXISTS (SELECT 1 FROM mentoria_avisos_enviados s WHERE s.chave = av.k)
$$;
--> statement-breakpoint

-- O próximo horário do despertador: um aviso futuro, ou um vencido que ainda vale (outra
-- instância segurando o lock). Nulo = nada a esperar.
CREATE FUNCTION mentoria_aviso_proximo(agora timestamptz) RETURNS timestamptz
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT min(c.quando) FROM mentoria_avisos_candidatos(agora) c
  WHERE c.quando > agora OR c.ate IS NULL OR agora < c.ate
$$;
--> statement-breakpoint

-- Reclama os avisos vencidos e válidos, uma vez só (lock + `mentoria_avisos_enviados`). Devolve
-- a chave e quem recebe; a API manda um push por pessoa, sem dado pessoal.
CREATE FUNCTION mentoria_aviso_reclamar(agora timestamptz)
  RETURNS TABLE (chave text, user_ids text[])
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mentoria_avisos'));
  RETURN QUERY
    WITH c AS (
      SELECT x.chave, x.user_ids FROM mentoria_avisos_candidatos(agora) x
      WHERE x.quando <= agora AND (x.ate IS NULL OR agora < x.ate)
    ),
    novos AS (
      INSERT INTO mentoria_avisos_enviados (chave) SELECT c.chave FROM c
      ON CONFLICT DO NOTHING RETURNING mentoria_avisos_enviados.chave
    )
    SELECT c.chave, c.user_ids FROM c JOIN novos n ON n.chave = c.chave;
END $$;
--> statement-breakpoint
ALTER FUNCTION mentoria_destinatarios(text, text) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_avisos_candidatos(timestamptz) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_aviso_proximo(timestamptz) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_aviso_reclamar(timestamptz) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_destinatarios(text, text), mentoria_avisos_candidatos(timestamptz),
  mentoria_aviso_proximo(timestamptz), mentoria_aviso_reclamar(timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_aviso_proximo(timestamptz), mentoria_aviso_reclamar(timestamptz)
  TO npac_app;
