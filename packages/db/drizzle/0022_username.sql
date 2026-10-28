ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");--> statement-breakpoint
-- Contas existentes: usuário = parte do e-mail antes do @ (só letras, números, _ e .),
-- com sufixo numérico se duas pessoas caírem no mesmo nome.
UPDATE "user" u SET username = x.base || CASE WHEN x.n > 1 THEN x.n::text ELSE '' END
FROM (
  SELECT id, b AS base, row_number() OVER (PARTITION BY b ORDER BY created_at, id) AS n
  FROM (SELECT id, created_at, lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_.]', '', 'g')) AS b FROM "user") s
) x
WHERE x.id = u.id AND u.username IS NULL;
