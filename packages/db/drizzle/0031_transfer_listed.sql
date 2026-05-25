-- v1.2 Sprint 26-5 — sell-own-players: mark for sale flag.
-- Hand-authored per project convention.

ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "transfer_listed" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_players_transfer_listed" ON "players" ("transfer_listed") WHERE "transfer_listed" = true;
