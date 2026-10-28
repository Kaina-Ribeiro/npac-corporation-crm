ALTER TYPE "public"."role" ADD VALUE 'DIRETOR' BEFORE 'HEAD';--> statement-breakpoint
-- Para a RLS, Diretoria tem o mesmo acesso a dados do Head: app_role() devolve HEAD para ela,
-- e nenhuma política precisa mudar. A diferença (só Diretoria dá/tira cargo de liderança)
-- é regra da API de usuários. Compara como texto: o valor novo do enum ainda não pode ser
-- usado dentro da mesma transação da migration.
CREATE OR REPLACE FUNCTION app_role() RETURNS role
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN u.role::text = 'DIRETOR' THEN 'HEAD'::role ELSE u.role END
  FROM "user" u WHERE u.id = app_user_id() AND u.active
$$;
