CREATE TABLE IF NOT EXISTS "derby_events" (
	"id" text PRIMARY KEY NOT NULL,
	"derby_id" text NOT NULL,
	"sequence" serial NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"server_created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processed_operations" (
	"op_id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"derby_id" text,
	"result" jsonb NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "derby_events" ADD CONSTRAINT "derby_events_derby_id_derbies_id_fk" FOREIGN KEY ("derby_id") REFERENCES "derbies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
