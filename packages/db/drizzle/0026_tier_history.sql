-- v1.1 Sprint 23: city-progression tier history (anti-yo-yo state machine).
-- Stored as jsonb shape { everReachedTier: 1|2|3|4, weeksBelow: { 2,3,4: int } }.
-- Nullable for backward compat with playthroughs created pre-v1.1.

ALTER TABLE "playthroughs" ADD COLUMN "tier_history" jsonb;
