-- v1.3 Tienda (#39) — merchandise stock + concessions (Pablo 2026-05-27).
-- Additive columns on clubs. Hand-authored per project convention.

ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_scarf_price"  integer NOT NULL DEFAULT 15;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_scarf_stock"  integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_cap_price"    integer NOT NULL DEFAULT 12;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_cap_stock"    integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_shirt_price"  integer NOT NULL DEFAULT 40;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "merch_shirt_stock"  integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "concession_food_price"  integer NOT NULL DEFAULT 4;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "concession_soda_price"  integer NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "concession_beer_price"  integer NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "concession_water_price" integer NOT NULL DEFAULT 2;
