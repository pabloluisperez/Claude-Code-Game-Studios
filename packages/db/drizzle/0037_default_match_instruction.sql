-- v1.2 — tactical instruction per-club default (Pablo 2026-05-26 autonomous).
-- Each manager picks a default instruction applied to all matches; AI clubs
-- get random instructions per fixture (deterministic by seed).
-- Hand-authored per project convention.

ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "default_match_instruction" text NOT NULL DEFAULT 'HOLD_SHAPE';
