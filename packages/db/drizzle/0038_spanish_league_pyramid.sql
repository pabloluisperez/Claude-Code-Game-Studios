-- v1.3 Spanish league pyramid (Pablo 2026-05-26).
-- Adds columns to support 5-tier structure with groups.
--
-- Pyramid:
--   Tier 1 (Primera):  1 group × 20 clubs
--   Tier 2 (Segunda):  1 group × 22 clubs
--   Tier 3 (1ª RFEF):  2 groups × 20 clubs
--   Tier 4 (2ª RFEF):  5 groups × 18 clubs
--   Tier 5 (3ª RFEF):  18 groups × 18 clubs (user starts here)
--
-- Hand-authored per project convention.

ALTER TABLE "divisions" ADD COLUMN IF NOT EXISTS "group_index" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Lightweight strength rating for AI clubs in distant divisions. Used by
-- strength-based simulation when per-player rosters aren't loaded.
-- 30 = Tier 5 baseline; 95 = Tier 1 elite.
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "tier" integer NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "group_index" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "strength_rating" integer NOT NULL DEFAULT 30;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_clubs_tier_group" ON "clubs" ("tier", "group_index");
