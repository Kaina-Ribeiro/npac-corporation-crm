import { sql, type SQL } from 'drizzle-orm';

// Contas por inscrição escritas dentro da consulta de lista (NPAC-69, auditoria de 23/11/2026).
// As funções do banco (`mentoria_mes_jornada`, `mentoria_onboarding_base`, 0051) são `LANGUAGE sql`
// com `SET search_path`, que o Postgres não embute: chamadas por linha, cada uma relê pausas e
// inscrição sob a RLS (era 0,3–0,5 s com ~360 inscrições). Aqui a conta é a mesma, feita uma vez
// por linha na própria consulta. Mudou a função, mude aqui e na Fila (0064); os testes
// `test/mentoria-listas-equivalencia.e2e.test.ts` comparam com as funções.

/**
 * `left join lateral` que dá `mj.mes` = `mentoria_mes_jornada(i.id, hoje)` para a inscrição `i`:
 * o dia de hoje sem os dias parados (`mentoria_dias_pausados`), contado em meses desde o início.
 */
export function mesJornadaJoin(hoje: SQL): SQL {
  return sql`
    left join lateral (
      select coalesce(sum(greatest(
          least(coalesce(pz.fim, ${hoje}), ${hoje})
            - greatest(pz.inicio, coalesce(i.inicio_jornada, pz.inicio)),
          0)), 0)::int as dias
      from mentoria_pausas pz where pz.inscricao_id = i.id) mj_p on true
    left join lateral (select ${hoje} - mj_p.dias as efetivo) mj_d on true
    left join lateral (select case
      when i.inicio_jornada is null or mj_d.efetivo < i.inicio_jornada then null else (
        select max(g)::int from generate_series(1, (
          extract(year from age(mj_d.efetivo, i.inicio_jornada)) * 12
          + extract(month from age(mj_d.efetivo, i.inicio_jornada)) + 2)::int) g
        where i.inicio_jornada + make_interval(months => g - 1) <= mj_d.efetivo
      ) end as mes offset 0) mj on true`;
}

/**
 * `left join lateral` que dá `ob_r.retomada`: o fim da última pausa encerrada da inscrição `i`,
 * como instante (meia-noite de Brasília). Com ele, `greatest(e.enviada_em, ob_r.retomada)` =
 * `mentoria_onboarding_base(e.id)` para as etapas da inscrição.
 */
export const RETOMADA_JOIN = sql`
  left join lateral (
    select max(pz.fim)::timestamp at time zone 'America/Sao_Paulo' as retomada
    from mentoria_pausas pz where pz.inscricao_id = i.id and pz.fim is not null) ob_r on true`;

/** Base da etapa `e` com `RETOMADA_JOIN`: = `mentoria_onboarding_base(e.id)`. */
export const BASE_ETAPA = sql`greatest(e.enviada_em, ob_r.retomada)`;
