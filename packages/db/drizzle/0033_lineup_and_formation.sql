-- v1.2 Sprint 27 — manual XI selection (Pablo 2026-05-25 "elegir 11 titular").
-- Hand-authored per project convention.

ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "starting_lineup_player_ids" jsonb;
--> statement-breakpoint

ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "preferred_formation" text NOT NULL DEFAULT '4-4-2';
