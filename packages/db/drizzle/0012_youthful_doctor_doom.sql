ALTER TABLE "clubs" ADD COLUMN "season_ticket_price_eur" integer DEFAULT 35 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "season_ticket_holders" integer DEFAULT 100 NOT NULL;