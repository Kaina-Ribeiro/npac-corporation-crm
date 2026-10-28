#!/bin/sh
set -e

# Cria a role de runtime (sujeita a RLS) e o banco de testes.
psql -v ON_ERROR_STOP=1 -v app_pw="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE npac_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'app_pw';
GRANT CONNECT ON DATABASE npac TO npac_app;
CREATE DATABASE npac_test OWNER npac_owner;
GRANT CONNECT ON DATABASE npac_test TO npac_app;
SQL
