CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_requests_username_unique" UNIQUE("username")
);
--> statement-breakpoint
-- Sem RLS (como "user"): só a API lê, guardada por admin:manage. Pedido não se altera, só cria e apaga.
GRANT SELECT, INSERT, DELETE ON access_requests TO npac_app;
