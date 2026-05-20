CREATE TABLE IF NOT EXISTS "career_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playthrough_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"week" integer NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "career_milestones" ADD CONSTRAINT "career_milestones_playthrough_id_playthroughs_id_fk" FOREIGN KEY ("playthrough_id") REFERENCES "public"."playthroughs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "career_milestones_pt_kind" ON "career_milestones" USING btree ("playthrough_id","kind");