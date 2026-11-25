CREATE TABLE "telegram_codigos" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hash" "bytea" NOT NULL,
	"vence_em" timestamp with time zone NOT NULL,
	CONSTRAINT "telegram_codigos_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "telegram_vinculos" (
	"user_id" text PRIMARY KEY NOT NULL,
	"chat_enc" "bytea" NOT NULL,
	"chat_bidx" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_vinculos_chat_bidx_unique" UNIQUE("chat_bidx")
);
--> statement-breakpoint
ALTER TABLE "telegram_codigos" ADD CONSTRAINT "telegram_codigos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_vinculos" ADD CONSTRAINT "telegram_vinculos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Avisos pelo Telegram (NPAC-74, Igor 24/11/2026: avisos do iPhone atrasam e somem). Cada pessoa conecta o
-- próprio Telegram pelo Meu perfil: a API cria um código de uso único (só o SHA-256 fica aqui, 10 minutos),
-- a pessoa toca em "Começar" no bot e o webhook do Telegram troca o código pelo vínculo pessoa ↔ chat.
-- Vínculo: cada um vê e apaga só o seu; ninguém grava direto (só telegram_conectar).
ALTER TABLE telegram_vinculos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE telegram_vinculos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY telegram_vinculos_own ON telegram_vinculos FOR SELECT
  USING (user_id = (SELECT app_user_id()));
--> statement-breakpoint
CREATE POLICY telegram_vinculos_delete ON telegram_vinculos FOR DELETE
  USING (user_id = (SELECT app_user_id()));
--> statement-breakpoint
GRANT SELECT, DELETE ON telegram_vinculos TO npac_app;
--> statement-breakpoint
-- Códigos: nem a própria pessoa lê (só as funções abaixo).
ALTER TABLE telegram_codigos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE telegram_codigos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Novo código da pessoa logada: troca o anterior dela e limpa os vencidos de todos.
CREATE FUNCTION telegram_codigo(p_hash bytea) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid text := app_user_id(); vence timestamptz := now() + interval '10 minutes';
BEGIN
  IF uid IS NULL OR app_role() IS NULL THEN RAISE EXCEPTION 'sem usuário' USING ERRCODE = '42501'; END IF;
  DELETE FROM telegram_codigos WHERE user_id = uid OR vence_em <= now();
  INSERT INTO telegram_codigos (user_id, hash, vence_em) VALUES (uid, p_hash, vence);
  RETURN vence;
END $$;
--> statement-breakpoint
-- O webhook do Telegram (sem sessão: pedido logado recebe 42501) troca o código pelo vínculo. Uso único:
-- o código sai mesmo vencido. Conta desativada não conecta. Um Telegram por pessoa: o mesmo chat ligado a
-- outra pessoa sai dela (vale quem conectou por último). Devolve a pessoa, ou nulo se o código não vale.
CREATE FUNCTION telegram_conectar(p_hash bytea, p_chat_enc bytea, p_chat_bidx text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid text; vence timestamptz;
BEGIN
  IF app_user_id() IS NOT NULL THEN RAISE EXCEPTION 'só o webhook' USING ERRCODE = '42501'; END IF;
  DELETE FROM telegram_codigos WHERE hash = p_hash RETURNING user_id, vence_em INTO uid, vence;
  IF uid IS NULL OR vence <= now() THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = uid AND u.active) THEN RETURN NULL; END IF;
  DELETE FROM telegram_vinculos WHERE chat_bidx = p_chat_bidx AND user_id <> uid;
  INSERT INTO telegram_vinculos (user_id, chat_enc, chat_bidx) VALUES (uid, p_chat_enc, p_chat_bidx)
  ON CONFLICT (user_id) DO UPDATE
    SET chat_enc = excluded.chat_enc, chat_bidx = excluded.chat_bidx, criado_em = now();
  RETURN uid;
END $$;
--> statement-breakpoint
-- Desativar a pessoa também desliga o Telegram dela (quem pode mexer na conta, como antes).
CREATE OR REPLACE FUNCTION push_purge_user(target text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT area_gerencia(target) THEN RAISE EXCEPTION 'sem permissão'; END IF;
  DELETE FROM push_subscriptions WHERE user_id = target;
  DELETE FROM telegram_vinculos WHERE user_id = target;
  DELETE FROM telegram_codigos WHERE user_id = target;
END $$;
--> statement-breakpoint
ALTER FUNCTION telegram_codigo(bytea) OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION telegram_conectar(bytea, bytea, text) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION telegram_codigo(bytea), telegram_conectar(bytea, bytea, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION telegram_codigo(bytea), telegram_conectar(bytea, bytea, text) TO npac_app;
