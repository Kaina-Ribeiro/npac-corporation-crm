-- NPAC-52: o pedido de acesso guarda a tela de onde veio (/login = COMERCIAL, /login/acompanhamento).
-- Pedidos antigos ficam como COMERCIAL (era a única tela). Grants da 0023 são da tabela inteira.
ALTER TABLE "access_requests" ADD COLUMN "area" text DEFAULT 'COMERCIAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_area_check" CHECK ("access_requests"."area" in ('COMERCIAL', 'ACOMPANHAMENTO'));
