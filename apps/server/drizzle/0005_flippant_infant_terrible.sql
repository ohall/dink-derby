ALTER TABLE "catches" ADD COLUMN "species_guessed" text;--> statement-breakpoint
ALTER TABLE "catches" ADD COLUMN "guess_length_in_inches" real;--> statement-breakpoint
ALTER TABLE "catches" ADD COLUMN "guess_weight_in_pounds" real;--> statement-breakpoint
ALTER TABLE "catches" ADD COLUMN "from_ai" boolean;--> statement-breakpoint
ALTER TABLE "catches" ADD COLUMN "rejected_as_non_fish" boolean;--> statement-breakpoint
ALTER TABLE "catches" ADD COLUMN "location_lat" real;--> statement-breakpoint
ALTER TABLE "catches" ADD COLUMN "location_lon" real;