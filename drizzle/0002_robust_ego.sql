CREATE TABLE "votes" (
	"post_id" text NOT NULL,
	"voter_pubkey" text NOT NULL,
	"value" integer NOT NULL,
	"signature" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "votes_post_id_voter_pubkey_pk" PRIMARY KEY("post_id","voter_pubkey")
);
--> statement-breakpoint
CREATE INDEX "votes_post_idx" ON "votes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "votes_voter_idx" ON "votes" USING btree ("voter_pubkey");--> statement-breakpoint
CREATE INDEX "votes_updated_at_idx" ON "votes" USING btree ("updated_at");