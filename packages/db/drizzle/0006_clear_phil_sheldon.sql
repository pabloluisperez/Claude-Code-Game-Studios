CREATE TABLE IF NOT EXISTS "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"role" text NOT NULL,
	"quality_tier" integer DEFAULT 1 NOT NULL,
	"weekly_eur_k" integer NOT NULL,
	"name" text NOT NULL,
	"hired_week" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"season" integer NOT NULL,
	"priority" text NOT NULL,
	"template_key" text NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff" ADD CONSTRAINT "staff_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff" ADD CONSTRAINT "staff_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_club_status" ON "staff" USING btree ("playthrough_id","club_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_messages_week" ON "staff_messages" USING btree ("playthrough_id","week");