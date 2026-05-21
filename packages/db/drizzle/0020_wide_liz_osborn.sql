ALTER TABLE "world_snapshots" ADD COLUMN "cascade_log" jsonb;--> statement-breakpoint
ALTER TABLE "world_snapshots" ADD COLUMN "threshold_crossings" jsonb;--> statement-breakpoint
ALTER TABLE "world_snapshots" ADD COLUMN "seed_state" text;