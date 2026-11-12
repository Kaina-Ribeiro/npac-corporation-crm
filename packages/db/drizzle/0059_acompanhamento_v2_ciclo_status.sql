-- Fase 2: status do ciclo sem a "segunda chance" (spec S1, pendente com a Eduarda; decisão do
-- Gabriel, 12/11/2026). Ciclo aberto fica EM_ANDAMENTO, com os dias de atraso calculados à parte
-- (prazo e hoje continuam na assinatura para quem chama); NAO_CONCLUIDO só quando o ciclo seguinte é
-- enviado sem este fechar (`nao_concluido_em`). Substitui a regra de 10–16/17+ dias da 0057.
CREATE OR REPLACE FUNCTION mentoria_ciclo_status(concluido date, nao_concluido date, prazo date, hoje date)
  RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN concluido IS NOT NULL THEN 'CONCLUIDO'
    WHEN nao_concluido IS NOT NULL THEN 'NAO_CONCLUIDO'
    ELSE 'EM_ANDAMENTO'
  END
$$;
