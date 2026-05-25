-- v1.2 Sprint 27 — individual training (Pablo 2026-05-25 "según el segundo
-- entrenador podamos entrenar a más jugadores a la vez").
-- Hand-authored per project convention.

ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "training_focus" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_players_training_focus" ON "players" ("training_focus") WHERE "training_focus" IS NOT NULL;
