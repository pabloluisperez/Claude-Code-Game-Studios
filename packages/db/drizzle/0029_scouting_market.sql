-- v1.1 Sprint 24 / Story SCOUTING-MARKET-001
-- Scouting & Transfer Market module — 6 new tables per ADR-031 §D2.
-- Hand-authored (drizzle-kit snapshot drift pre-existing — see story 22-1).

CREATE TABLE IF NOT EXISTS "scouting_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"window_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"cost_paid_eur_k" integer NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completes_at_week" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"refunded_eur_k" integer,
	"status" text NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "scouting_actions" ADD CONSTRAINT "scouting_actions_club_id_clubs_id_fk"
		FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "scouting_actions" ADD CONSTRAINT "scouting_actions_player_id_players_id_fk"
		FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_scout_window_club" ON "scouting_actions" ("window_id", "club_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scout_pending" ON "scouting_actions" ("status", "completes_at_week");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "transfer_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_club_id" uuid NOT NULL,
	"seller_club_id" uuid,
	"player_id" uuid NOT NULL,
	"window_id" uuid NOT NULL,
	"fee_eur_k" integer NOT NULL,
	"wage_offer_eur_k_week" integer NOT NULL,
	"contract_weeks" integer NOT NULL,
	"status" text NOT NULL,
	"counter_offer_eur_k" integer,
	"bid_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "transfer_offers" ADD CONSTRAINT "transfer_offers_buyer_club_id_clubs_id_fk"
		FOREIGN KEY ("buyer_club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "transfer_offers" ADD CONSTRAINT "transfer_offers_seller_club_id_clubs_id_fk"
		FOREIGN KEY ("seller_club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "transfer_offers" ADD CONSTRAINT "transfer_offers_player_id_players_id_fk"
		FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_offers_buyer_window" ON "transfer_offers" ("buyer_club_id", "window_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_offers_player_window" ON "transfer_offers" ("player_id", "window_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_club_id_clubs_id_fk"
		FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_saved_search_club_name" ON "saved_searches" ("club_id", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ai_club_window_state" (
	"club_id" uuid NOT NULL,
	"window_id" uuid NOT NULL,
	"bargain_factor" real NOT NULL,
	"transfer_budget_used_eur_k" integer NOT NULL DEFAULT 0,
	"rotation_completed" boolean NOT NULL DEFAULT false,
	CONSTRAINT "ai_club_window_state_pk" PRIMARY KEY ("club_id", "window_id")
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "ai_club_window_state" ADD CONSTRAINT "ai_club_window_state_club_id_clubs_id_fk"
		FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "player_buyer_rejections" (
	"player_id" uuid NOT NULL,
	"buyer_club_id" uuid NOT NULL,
	"window_id" uuid NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "player_buyer_rejections_pk" PRIMARY KEY ("player_id", "buyer_club_id", "window_id")
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "player_buyer_rejections" ADD CONSTRAINT "player_buyer_rejections_player_id_players_id_fk"
		FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "player_buyer_rejections" ADD CONSTRAINT "player_buyer_rejections_buyer_club_id_clubs_id_fk"
		FOREIGN KEY ("buyer_club_id") REFERENCES "clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "scouting_market_window_status" (
	"window_id" uuid PRIMARY KEY NOT NULL,
	"rotation_started_at" timestamp with time zone,
	"rotation_completed_at" timestamp with time zone
);
