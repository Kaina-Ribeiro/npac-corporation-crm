ALTER TABLE "leads" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_legacy_id_unique" UNIQUE("legacy_id");--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_legacy_id_unique" UNIQUE("legacy_id");--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_legacy_id_unique" UNIQUE("legacy_id");