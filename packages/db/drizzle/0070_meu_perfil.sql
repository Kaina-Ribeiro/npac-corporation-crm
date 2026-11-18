-- NPAC-53: foto do perfil (uma por pessoa, 256 px, até 200 KB). Sem RLS, como "user": só a API grava,
-- pela sessão da própria pessoa. A versão fica em "user".image.
CREATE TABLE "user_photos" (
	"user_id" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_photos_mime" CHECK ("user_photos"."mime" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "user_photos_size" CHECK ("user_photos"."size" between 1 and 204800)
);
--> statement-breakpoint
ALTER TABLE "user_photos" ADD CONSTRAINT "user_photos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "user_photos" TO npac_app;
