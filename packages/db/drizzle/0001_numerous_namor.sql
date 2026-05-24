CREATE TABLE IF NOT EXISTS "playthroughs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"current_week" integer DEFAULT 0 NOT NULL,
	"last_tick_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"world_state" jsonb NOT NULL,
	"delayed_effects_buffer" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"nationality" text DEFAULT 'ES' NOT NULL,
	"birth_week" integer NOT NULL,
	"position" text NOT NULL,
	"skill" integer NOT NULL,
	"fitness" integer DEFAULT 90 NOT NULL,
	"morale" integer DEFAULT 60 NOT NULL,
	"form" integer DEFAULT 60 NOT NULL,
	"stamina" integer DEFAULT 75 NOT NULL,
	"reflexes" integer,
	"handling" integer,
	"kicking" integer,
	"strength" integer,
	"tackling" integer,
	"positioning" integer,
	"passing" integer,
	"vision" integer,
	"work_rate" integer,
	"speed" integer,
	"finishing" integer,
	"dribbling" integer,
	"potential_ceiling" integer,
	"salary_eur_k" integer NOT NULL,
	"contract_start_week" integer NOT NULL,
	"contract_end_week" integer NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"injured_until_week" integer,
	"recent_ratings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "playthroughs" ADD CONSTRAINT "playthroughs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "playthroughs" ADD CONSTRAINT "playthroughs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
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
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "world_snapshots_playthrough_week" ON "world_snapshots" USING btree ("playthrough_id","week");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_by_club" ON "players" USING btree ("playthrough_id","club_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_by_playthrough" ON "players" USING btree ("playthrough_id");