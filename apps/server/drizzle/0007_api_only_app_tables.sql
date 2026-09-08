ALTER TABLE "catches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "derbies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "derby_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "derby_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "processed_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- App data is accessed through the authenticated Fastify API, never directly
-- through Supabase's Data API. No browser-role policies are intentional. The
-- server's table-owner connection retains access; Auth/Storage are untouched.
-- Revoke all privileges as RLS alone does not protect TRUNCATE.
REVOKE ALL ON TABLE public.catches, public.chat_messages, public.derbies,
  public.derby_events, public.derby_participants, public.devices, public.media,
  public.processed_operations, public.reactions, public.users FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.derby_events_sequence_seq FROM PUBLIC;
DO $$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    -- Plain PostgreSQL development databases may not have Supabase roles.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.catches, public.chat_messages, public.derbies, public.derby_events, public.derby_participants, public.devices, public.media, public.processed_operations, public.reactions, public.users FROM %I', browser_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.derby_events_sequence_seq FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
