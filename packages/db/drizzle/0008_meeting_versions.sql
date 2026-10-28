ALTER TABLE "meetings" ADD COLUMN "outcome_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;