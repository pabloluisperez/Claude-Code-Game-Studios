CREATE TABLE IF NOT EXISTS "clubs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"base_skill" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fixtures" (
	"id" text PRIMARY KEY NOT NULL,
	"playthrough_id" text NOT NULL,
	"week" integer NOT NULL,
	"home_club_id" text NOT NULL,
	"away_club_id" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"match_events" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"playthrough_id" text NOT NULL,
	"fixture_id" text NOT NULL,
	"state" text DEFAULT 'pre_match' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"timeout_job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playthroughs" (
	"id" text PRIMARY KEY NOT NULL,
	"manager_club_id" text NOT NULL,
	"current_week" integer DEFAULT 1 NOT NULL,
	"seed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"playthrough_id" text NOT NULL,
	"week" integer NOT NULL,
	"staff_role" text NOT NULL,
	"staff_tier" integer DEFAULT 1 NOT NULL,
	"template_key" text NOT NULL,
	"body" text NOT NULL,
	"priority" text DEFAULT 'ROUTINE' NOT NULL,
	"causal_node_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"playthrough_id" text NOT NULL,
	"club_id" text NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"goals_for" integer DEFAULT 0 NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"playthrough_id" text NOT NULL,
	"week" integer NOT NULL,
	"state" jsonb NOT NULL,
	"delayed_buffer" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"manager_state" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_home_club_id_clubs_id_fk" FOREIGN KEY ("home_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_away_club_id_clubs_id_fk" FOREIGN KEY ("away_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "playthroughs" ADD CONSTRAINT "playthroughs_manager_club_id_clubs_id_fk" FOREIGN KEY ("manager_club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "standings" ADD CONSTRAINT "standings_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "standings" ADD CONSTRAINT "standings_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "world_snapshots" ADD CONSTRAINT "world_snapshots_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fixtures_playthrough_week_home_away" ON "fixtures" USING btree ("playthrough_id","week","home_club_id","away_club_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "match_sessions_active_playthrough" ON "match_sessions" USING btree ("playthrough_id") WHERE "match_sessions"."state" NOT IN ('completed','archived','failed');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "standings_playthrough_club" ON "standings" USING btree ("playthrough_id","club_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "world_snapshots_playthrough_week" ON "world_snapshots" USING btree ("playthrough_id","week");