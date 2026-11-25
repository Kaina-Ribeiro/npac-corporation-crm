ALTER TABLE "user" ADD COLUMN "novidades_vista" text;

-- NPAC-77: id da novidade mais nova que a pessoa viu (`@npac/shared/novidades`). Sem RLS, como o resto de
-- `user`. Nula: a primeira leitura de /api/me grava a mais nova (ninguém recebe o histórico de uma vez, S2).
