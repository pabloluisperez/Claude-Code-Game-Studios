ALTER TABLE "ai_club_window_state" DROP CONSTRAINT IF EXISTS "ai_club_window_state_pk";--> statement-breakpoint
ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_pkey";--> statement-breakpoint
-- calendar_events_tv_unique_per_season was a UNIQUE INDEX, not a CONSTRAINT; already dropped at line 38
ALTER TABLE "career_milestones" DROP CONSTRAINT IF EXISTS "career_milestones_pkey";--> statement-breakpoint
ALTER TABLE "career_milestones" DROP CONSTRAINT IF EXISTS "career_milestones_pt_kind";--> statement-breakpoint
ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "clubs_pkey";--> statement-breakpoint
ALTER TABLE "divisions" DROP CONSTRAINT IF EXISTS "divisions_pkey";--> statement-breakpoint
ALTER TABLE "fixtures" DROP CONSTRAINT IF EXISTS "fixtures_pkey";--> statement-breakpoint
ALTER TABLE "fixtures" DROP CONSTRAINT IF EXISTS "fixtures_season_week_home";--> statement-breakpoint
ALTER TABLE "leagues" DROP CONSTRAINT IF EXISTS "leagues_pkey";--> statement-breakpoint
ALTER TABLE "manager_profiles" DROP CONSTRAINT IF EXISTS "manager_profiles_pkey";--> statement-breakpoint
ALTER TABLE "match_sessions" DROP CONSTRAINT IF EXISTS "match_sessions_active_playthrough";--> statement-breakpoint
ALTER TABLE "match_sessions" DROP CONSTRAINT IF EXISTS "match_sessions_pkey";--> statement-breakpoint
ALTER TABLE "player_buyer_rejections" DROP CONSTRAINT IF EXISTS "player_buyer_rejections_pk";--> statement-breakpoint
ALTER TABLE "players" DROP CONSTRAINT IF EXISTS "players_pkey";--> statement-breakpoint
ALTER TABLE "playthroughs" DROP CONSTRAINT IF EXISTS "playthroughs_pkey";--> statement-breakpoint
ALTER TABLE "saved_searches" DROP CONSTRAINT IF EXISTS "saved_searches_pkey";--> statement-breakpoint
ALTER TABLE "saved_searches" DROP CONSTRAINT IF EXISTS "uniq_saved_search_club_name";--> statement-breakpoint
ALTER TABLE "scouting_actions" DROP CONSTRAINT IF EXISTS "scouting_actions_pkey";--> statement-breakpoint
ALTER TABLE "scouting_market_window_status" DROP CONSTRAINT IF EXISTS "scouting_market_window_status_pkey";--> statement-breakpoint
ALTER TABLE "seasons" DROP CONSTRAINT IF EXISTS "seasons_pkey";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_pkey";--> statement-breakpoint
ALTER TABLE "skill_xp_events" DROP CONSTRAINT IF EXISTS "skill_xp_events_pkey";--> statement-breakpoint
ALTER TABLE "sponsors" DROP CONSTRAINT IF EXISTS "sponsors_pkey";--> statement-breakpoint
ALTER TABLE "stadium_upgrade_items" DROP CONSTRAINT IF EXISTS "stadium_upgrade_items_pkey";--> statement-breakpoint
ALTER TABLE "stadium_upgrade_items" DROP CONSTRAINT IF EXISTS "stadium_upgrade_one_active_per_club";--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_pkey";--> statement-breakpoint
ALTER TABLE "staff_messages" DROP CONSTRAINT IF EXISTS "staff_messages_pkey";--> statement-breakpoint
ALTER TABLE "standings" DROP CONSTRAINT IF EXISTS "standings_pkey";--> statement-breakpoint
ALTER TABLE "transfer_offers" DROP CONSTRAINT IF EXISTS "transfer_offers_pkey";--> statement-breakpoint
ALTER TABLE "tv_contracts" DROP CONSTRAINT IF EXISTS "tv_contracts_pkey";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_pkey";--> statement-breakpoint
ALTER TABLE "world_snapshots" DROP CONSTRAINT IF EXISTS "world_snapshots_pkey";--> statement-breakpoint
ALTER TABLE "world_snapshots" DROP CONSTRAINT IF EXISTS "world_snapshots_playthrough_week";--> statement-breakpoint
ALTER TABLE "clubs" DROP CONSTRAINT IF EXISTS "clubs_manager_id_users_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_club_window_state_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "calendar_events_tv_unique_per_season";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_clubs_tier_group";--> statement-breakpoint
DROP INDEX IF EXISTS "manager_profiles_playthrough_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "player_buyer_rejections_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_players_contract_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_players_transfer_listed";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_players_training_focus";--> statement-breakpoint
DROP INDEX IF EXISTS "stadium_upgrade_one_active_per_club";--> statement-breakpoint
DROP INDEX IF EXISTS "standings_club_per_season_div";--> statement-breakpoint
DROP INDEX IF EXISTS "tv_contracts_playthrough_season_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "users_email_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "users_username_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "match_sessions_active_playthrough";--> statement-breakpoint
ALTER TABLE "ai_club_window_state" ALTER COLUMN "rotation_completed" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "ai_club_window_state" ALTER COLUMN "transfer_budget_used_eur_k" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "consumed" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "career_milestones" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "clubs" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "boards_capacity" SET DEFAULT 4;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "budget" SET DEFAULT 10000;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "city_tier" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "concession_beer_price" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "concession_food_price" SET DEFAULT 4;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "concession_soda_price" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "concession_water_price" SET DEFAULT 2;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "current_season" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "division" SET DATA TYPE division;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "fan_base" SET DEFAULT 500;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "group_index" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "last_season_ticket_paid_season" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "merch_cap_price" SET DEFAULT 12;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "merch_cap_stock" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "merch_scarf_mfg_qty" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "merch_scarf_price" SET DEFAULT 15;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "merch_scarf_stock" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "merch_shirt_price" SET DEFAULT 40;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "merch_shirt_stock" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "prestige" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "season_ticket_holders" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "season_ticket_holders_collected" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "season_ticket_price_eur" SET DEFAULT 35;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "season_ticket_price_locked_season" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "strength_rating" SET DEFAULT 30;--> statement-breakpoint
ALTER TABLE "clubs" ALTER COLUMN "tier" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "divisions" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "divisions" ALTER COLUMN "club_count" SET DEFAULT 20;--> statement-breakpoint
ALTER TABLE "divisions" ALTER COLUMN "group_index" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "fixtures" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "leagues" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "manager_profiles" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "manager_profiles" ALTER COLUMN "fan_loyalty" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "match_sessions" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "match_sessions" ALTER COLUMN "away_substitutions_used" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "match_sessions" ALTER COLUMN "current_tick" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "match_sessions" ALTER COLUMN "events_accumulated" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "match_sessions" ALTER COLUMN "home_momentum" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "match_sessions" ALTER COLUMN "substitutions_used" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "match_sessions" ALTER COLUMN "yellow_cards_by_player_id" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "players" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "agresividad" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "calidad" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "fitness" SET DEFAULT 90;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "form" SET DEFAULT 60;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "morale" SET DEFAULT 60;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "recent_ratings" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "resistencia" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "stamina" SET DEFAULT 75;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "traits" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "transfer_listed" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "velocidad" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "wage_expectation_eur_k_week" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "weeks_unsigned" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "players" ALTER COLUMN "yellow_cards_season" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "playthroughs" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "playthroughs" ALTER COLUMN "advance_resume_day" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "playthroughs" ALTER COLUMN "current_day_of_season" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "playthroughs" ALTER COLUMN "current_week" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "playthroughs" ALTER COLUMN "training_intensity" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "scouting_actions" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "scouting_market_window_status" ADD PRIMARY KEY ("window_id");--> statement-breakpoint
ALTER TABLE "seasons" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "skill_xp_events" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "sponsors" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "stadium_upgrade_items" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "staff" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "quality_tier" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "staff_messages" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "staff_messages" ALTER COLUMN "is_read" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "standings" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "standings" ALTER COLUMN "draws" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "standings" ALTER COLUMN "goals_against" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "standings" ALTER COLUMN "goals_for" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "standings" ALTER COLUMN "losses" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "standings" ALTER COLUMN "played" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "standings" ALTER COLUMN "points" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "standings" ALTER COLUMN "wins" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "transfer_offers" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "tv_contracts" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "tv_contracts" ALTER COLUMN "season_in_contract" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "tv_contracts" ALTER COLUMN "weekly_rate_eur_k" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "users" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "world_snapshots" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "world_snapshots" ALTER COLUMN "delayed_effects_buffer" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "world_snapshots" ALTER COLUMN "stadium_upgrade_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "world_snapshots" ALTER COLUMN "training_facility_level" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "world_snapshots" ALTER COLUMN "youth_academy_level" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ai_club_window_state" ADD CONSTRAINT "ai_club_window_state_club_id_window_id_pk" PRIMARY KEY("club_id","window_id");--> statement-breakpoint
ALTER TABLE "player_buyer_rejections" ADD CONSTRAINT "player_buyer_rejections_player_id_buyer_club_id_window_id_pk" PRIMARY KEY("player_id","buyer_club_id","window_id");--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "merch_scarf_mfg_weeks_left" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "merch_scarf_unit_cost" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "merch_cap_mfg_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "merch_cap_mfg_weeks_left" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "merch_cap_unit_cost" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "merch_shirt_mfg_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "merch_shirt_mfg_weeks_left" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "merch_shirt_unit_cost" integer DEFAULT 18 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clubs" ADD CONSTRAINT "clubs_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "match_sessions_active_playthrough" ON "match_sessions" USING btree ("playthrough_id") WHERE "match_sessions"."state" NOT IN ('completed', 'archived', 'failed');