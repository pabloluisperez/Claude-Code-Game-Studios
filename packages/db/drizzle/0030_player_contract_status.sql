-- v1.2 Sprint 25 / Story 25-2
-- Free-agent contractStatus + weeks-unsigned counter + wage expectation.
-- Enables story SCOUTING-MARKET-005 (offer service) + 25-5 AI rotation worker.
-- Hand-authored per project convention (drizzle snapshot drift documented in 25-1).

ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "contract_status" text NOT NULL DEFAULT 'in_contract';
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "weeks_unsigned" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "wage_expectation_eur_k_week" integer NOT NULL DEFAULT 5;
--> statement-breakpoint

-- Backfill: players whose contract has fewer than 8 weeks remaining → 'expiring'.
-- Players with a NULL club_id (none in v1.1 schema, but defensive) → 'free_agent'.
UPDATE "players" SET "contract_status" = 'expiring'
  WHERE "contract_status" = 'in_contract'
    AND "contract_end_week" - "contract_start_week" <= 8;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_players_contract_status" ON "players" ("contract_status");
