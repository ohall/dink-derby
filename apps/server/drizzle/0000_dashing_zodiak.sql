CREATE TABLE IF NOT EXISTS "catches" (
	"id" text PRIMARY KEY NOT NULL,
	"derby_id" text NOT NULL,
	"user_id" text NOT NULL,
	"species" text,
	"length_in_inches" real,
	"weight_in_pounds" real,
	"count" integer DEFAULT 1 NOT NULL,
	"photo_url" text,
	"caught_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"derby_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"sent_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "derbies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"body_of_water_name" text NOT NULL,
	"scoring_mode" text NOT NULL,
	"scoring_unit" text,
	"created_by_user_id" text NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "derby_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"derby_id" text NOT NULL,
	"user_id" text NOT NULL,
	"nickname" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catches" ADD CONSTRAINT "catches_derby_id_derbies_id_fk" FOREIGN KEY ("derby_id") REFERENCES "derbies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "catches" ADD CONSTRAINT "catches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_derby_id_derbies_id_fk" FOREIGN KEY ("derby_id") REFERENCES "derbies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "derbies" ADD CONSTRAINT "derbies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "derby_participants" ADD CONSTRAINT "derby_participants_derby_id_derbies_id_fk" FOREIGN KEY ("derby_id") REFERENCES "derbies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "derby_participants" ADD CONSTRAINT "derby_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
