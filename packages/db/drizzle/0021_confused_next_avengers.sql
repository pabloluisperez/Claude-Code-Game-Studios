-- Sprint 11 task 11-4 (ADR-020 Day-by-Day Tick): add current_day_of_season.
-- The new column tracks the day cursor inside the season (0..265 for 38-week
-- season + buffer). currentWeek becomes derived: floor(currentDayOfSeason / 7).
-- Backfill: existing rows get current_day_of_season = current_week * 7 so the
-- invariant holds from migration time forward.
ALTER TABLE "playthroughs" ADD COLUMN "current_day_of_season" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "playthroughs" SET "current_day_of_season" = "current_week" * 7;
