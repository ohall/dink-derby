CREATE TABLE IF NOT EXISTS "media" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"derby_id" text NOT NULL,
	"catch_id" text,
	"content_hash" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"remote_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"client_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"derby_id" text NOT NULL,
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"client_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catches" ADD COLUMN "photo_media_id" text;--> statement-breakpoint
ALTER TABLE "catches" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "derbies" ADD COLUMN "scoring_style" text;--> statement-breakpoint
ALTER TABLE "derbies" ADD COLUMN "best_n" integer;--> statement-breakpoint
ALTER TABLE "derbies" ADD COLUMN "species_filter" text;--> statement-breakpoint
ALTER TABLE "derbies" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "derbies" ADD COLUMN "status" text DEFAULT 'draft';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media" ADD CONSTRAINT "media_derby_id_derbies_id_fk" FOREIGN KEY ("derby_id") REFERENCES "derbies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_derby_id_derbies_id_fk" FOREIGN KEY ("derby_id") REFERENCES "derbies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
