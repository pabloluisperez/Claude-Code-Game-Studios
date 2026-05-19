CREATE TABLE IF NOT EXISTS "match_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"fixture_id" uuid NOT NULL,
	"current_tick" integer DEFAULT 0 NOT NULL,
	"events_accumulated" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_lineup_home" jsonb NOT NULL,
	"current_lineup_away" jsonb NOT NULL,
	"home_momentum" real DEFAULT 50 NOT NULL,
	"substitutions_used" integer DEFAULT 0 NOT NULL,
	"away_substitutions_used" integer DEFAULT 0 NOT NULL,
	"yellow_cards_by_player_id" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_formation_home" text NOT NULL,
	"current_formation_away" text NOT NULL,
	"active_instruction_home" text,
	"active_instruction_away" text,
	"prng_state" text NOT NULL,
	"state" text DEFAULT 'pre_match' NOT NULL,
	"timeout_job_id" text,
	"seed" text NOT NULL,
	"player_club_side" text NOT NULL,
	"player_club_id" uuid NOT NULL,
	"pre_match_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_player_club_id_clubs_id_fk" FOREIGN KEY ("player_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "match_sessions_active_playthrough" ON "match_sessions" USING btree ("playthrough_id") WHERE "match_sessions"."state" NOT IN ('completed', 'archived', 'failed');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_sessions_by_playthrough_created" ON "match_sessions" USING btree ("playthrough_id","created_at");