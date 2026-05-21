-- Sprint 13 task 13-1: rename suspension tracking from weeks to matches.
-- Pablo's playtest clarification: real-football suspensions are per-fixture,
-- not per-week. A bye week doesn't count down. The 0023 migration added
-- `suspended_until_week` which we now replace with `suspended_matches_remaining`
-- (counter that decrements each match the player's club plays).
ALTER TABLE "players" DROP COLUMN IF EXISTS "suspended_until_week";--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "suspended_matches_remaining" integer;--> statement-breakpoint
-- 5-yellow accumulation tracking (also Sprint 13 task 13-1, Pablo
-- clarification): tracks total yellows accrued by a player this season.
-- When this reaches 5, the player is auto-suspended for 1 match
-- (incremented suspended_matches_remaining) and the counter resets to 0.
ALTER TABLE "players" ADD COLUMN "yellow_cards_season" integer NOT NULL DEFAULT 0;
