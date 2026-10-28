-- Uma vez, no Postgres gerenciado do Cubeship, conectado com o usuário admin dele:
--   psql "$ADMIN_URL" -v owner_pw="..." -v app_pw="..." -f deploy/cubeship/bootstrap.sql
-- As migrations esperam estes nomes: npac_owner (dono, ignora RLS; roda migrations e
-- funções SECURITY DEFINER) e npac_app (runtime, sujeito a RLS). Nunca troque o
-- runtime para o owner: a autorização de linha depende disso.
\set ON_ERROR_STOP on
CREATE ROLE npac_owner LOGIN NOSUPERUSER BYPASSRLS CREATEROLE PASSWORD :'owner_pw';
CREATE ROLE npac_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'app_pw';
CREATE DATABASE npac OWNER npac_owner;
GRANT CONNECT ON DATABASE npac TO npac_app;
