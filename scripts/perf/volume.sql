-- Volume de medição (scripts/perf/seed.mjs, banco npac_e2e_perf). Clona os leads do mock 60 vezes,
-- com reuniões; das gerações 3 em diante o closer vira o Ronaldo (Head, já vê tudo), para a Sônia
-- ficar com menos de 500 leads (meta do closer em T1.5). 10 eventos
-- de timeline por lead e cada inscrição do Acompanhamento 25 vezes, com pessoas, ações e etapas do
-- onboarding. Cópia por jsonb_populate_record: coluna nova entra sozinha. Gatilhos desligados
-- durante a carga (session_replication_role); `analyze` no fim.
set session_replication_role = replica;

create temp table perf_leads as
select l.id as orig, g, gen_random_uuid() as novo
from leads l, generate_series(1, 60) g
where l.legacy_id like 'mock-%';

create temp table perf_closer as select id from "user" where username = 'ronaldo';

insert into leads
select (jsonb_populate_record(null::leads, to_jsonb(l) || jsonb_build_object(
  'id', p.novo,
  'instagram', 'clone' || p.g || '_' || left(l.id::text, 8),
  'phone_enc', null, 'phone_bidx', null, 'email_enc', null, 'email_bidx', null,
  'legacy_id', null,
  'closer_id', case when p.g <= 2 or l.closer_id is null then l.closer_id
                     else (select id from perf_closer) end,
  'created_at', l.created_at - make_interval(hours => p.g),
  'updated_at', l.updated_at - make_interval(hours => p.g)))).*
from leads l join perf_leads p on p.orig = l.id;

insert into meetings
select (jsonb_populate_record(null::meetings, to_jsonb(m) || jsonb_build_object(
  'id', gen_random_uuid(), 'lead_id', p.novo, 'legacy_id', null,
  'closer_id', case when p.g <= 2 then m.closer_id else (select id from perf_closer) end,
  'scheduled_at', m.scheduled_at - make_interval(hours => p.g),
  'created_at', m.created_at - make_interval(hours => p.g)))).*
from meetings m join perf_leads p on p.orig = m.lead_id;

insert into lead_timeline (lead_id, kind, actor_id, at)
select l.id, case when k = 1 then 'lead.created' else 'lead.updated' end, l.created_by,
  l.created_at + make_interval(mins => k)
from leads l, generate_series(1, 10) k;

create temp table perf_inscricoes as
select i.id as orig, g, gen_random_uuid() as novo
from mentoria_inscricoes i, generate_series(1, 25) g;

insert into mentoria_inscricoes
select (jsonb_populate_record(null::mentoria_inscricoes, to_jsonb(i) || jsonb_build_object(
  'id', p.novo, 'importacao_chave', null, 'foto_familia_midia_id', null))).*
from mentoria_inscricoes i join perf_inscricoes p on p.orig = i.id;

insert into mentoria_pessoas
select (jsonb_populate_record(null::mentoria_pessoas, to_jsonb(x) || jsonb_build_object(
  'id', gen_random_uuid(), 'inscricao_id', p.novo,
  'whatsapp_idx', null, 'email_idx', null, 'foto_midia_id', null))).*
from mentoria_pessoas x join perf_inscricoes p on p.orig = x.inscricao_id;

insert into mentoria_acoes
select (jsonb_populate_record(null::mentoria_acoes, to_jsonb(x) || jsonb_build_object(
  'id', gen_random_uuid(), 'inscricao_id', p.novo, 'evidencia_midia_id', null))).*
from mentoria_acoes x join perf_inscricoes p on p.orig = x.inscricao_id;

insert into mentoria_onboarding_etapas
select (jsonb_populate_record(null::mentoria_onboarding_etapas, to_jsonb(x) || jsonb_build_object(
  'id', gen_random_uuid(), 'inscricao_id', p.novo))).*
from mentoria_onboarding_etapas x join perf_inscricoes p on p.orig = x.inscricao_id;

set session_replication_role = default;
analyze;
