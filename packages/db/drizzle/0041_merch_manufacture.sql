-- v1.3 Tienda rework (#39, Pablo 2026-05-27): manufacturing takes time +
-- avg cost tracking for margin display. Additive columns. Hand-authored.

-- In-progress manufacture order per merch kind (qty 0 = none).
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_scarf_mfg_qty"        integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_scarf_mfg_weeks_left" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_scarf_unit_cost"      integer NOT NULL DEFAULT 6;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_cap_mfg_qty"          integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_cap_mfg_weeks_left"   integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_cap_unit_cost"        integer NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_shirt_mfg_qty"        integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_shirt_mfg_weeks_left" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_shirt_unit_cost"      integer NOT NULL DEFAULT 18;
