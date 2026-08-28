CREATE UNIQUE INDEX IF NOT EXISTS "derbies_invite_code_idx" ON "derbies" ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "derby_participants_derby_user_idx" ON "derby_participants" ("derby_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "derby_participants_user_idx" ON "derby_participants" ("user_id");