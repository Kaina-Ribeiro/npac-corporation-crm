CREATE TABLE "mentoria_mentorados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"nome_norm" text NOT NULL,
	"tipo_cadastro" text,
	"tipo_mentoria" text,
	"data_entrada_texto" text,
	"data_entrada" date,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_mentorados_nome_norm_unique" UNIQUE("nome_norm"),
	CONSTRAINT "mentoria_mentorados_nome" CHECK (char_length("mentoria_mentorados"."nome") between 1 and 200),
	CONSTRAINT "mentoria_mentorados_status" CHECK ("mentoria_mentorados"."status" in ('ENGAJADO', 'EM_ATENCAO', 'EM_RISCO'))
);
--> statement-breakpoint
ALTER TABLE "mentoria_mentorados" ADD CONSTRAINT "mentoria_mentorados_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_mentorados" ADD CONSTRAINT "mentoria_mentorados_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Acesso ao módulo Acompanhamento: papel cru (texto), nunca app_role(), que devolve HEAD para
-- DIRETOR (0021). Só Diretoria e Acompanhamento, ativos. Compara como texto: o valor
-- ACOMPANHAMENTO entrou no enum na 0028 e não deve ser usado como literal de enum aqui.
CREATE FUNCTION mentoria_pode() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = app_user_id() AND u.active AND u.role::text IN ('DIRETOR', 'ACOMPANHAMENTO')
  )
$$;
--> statement-breakpoint
ALTER FUNCTION mentoria_pode() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_pode() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_pode() TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_mentorados ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_mentorados FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_mentorados_acesso ON mentoria_mentorados FOR ALL
  USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
-- Sem DELETE: exclusão só por função SECURITY DEFINER (mentoria_excluir_registro).
GRANT SELECT, INSERT ON mentoria_mentorados TO npac_app;
--> statement-breakpoint
GRANT UPDATE (nome, nome_norm, tipo_cadastro, tipo_mentoria, data_entrada_texto, data_entrada, status, version, updated_by, updated_at) ON mentoria_mentorados TO npac_app;
