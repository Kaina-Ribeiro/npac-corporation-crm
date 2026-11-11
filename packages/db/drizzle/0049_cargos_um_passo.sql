-- Cargos em um passo (spec 2026-11-11-cargos-design). SDR, Closer e Acompanhamento têm as caixas
-- "Atua como SDR/Closer" definidas pelo cargo; só Head e Diretoria escolhem. Antes do CHECK,
-- normaliza quem estiver fora da regra (no dev de 11/11 não havia nenhum).
UPDATE "user" SET can_prospect = true, can_close = false
  WHERE role::text = 'SDR' AND (NOT can_prospect OR can_close);
--> statement-breakpoint
UPDATE "user" SET can_prospect = false, can_close = true
  WHERE role::text = 'CLOSER' AND (can_prospect OR NOT can_close);
--> statement-breakpoint
UPDATE "user" SET can_prospect = false, can_close = false
  WHERE role::text = 'ACOMPANHAMENTO' AND (can_prospect OR can_close);
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_cargo_caixas" CHECK (case "user"."role"::text
        when 'SDR' then "user"."can_prospect" and not "user"."can_close"
        when 'CLOSER' then "user"."can_close" and not "user"."can_prospect"
        when 'ACOMPANHAMENTO' then not "user"."can_prospect" and not "user"."can_close"
        else true end);
