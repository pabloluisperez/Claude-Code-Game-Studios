-- v1.3 — Pablo 2026-05-26: track attribute deltas per player for UI arrows.
-- Snapshot of (skill, vel, res, agr, cal) BEFORE the current advance tick.
-- Updated once at start of each advance, then the UI diffs against current.
-- Hand-authored per project convention.

ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "prev_attrs" jsonb;
