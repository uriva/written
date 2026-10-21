CREATE TABLE "stances" (
	"post_id" text NOT NULL,
	"voter_pubkey" text NOT NULL,
	"stance" text NOT NULL,
	"signature" text NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "stances_post_id_voter_pubkey_pk" PRIMARY KEY("post_id","voter_pubkey")
);
--> statement-breakpoint
CREATE INDEX "stances_post_idx" ON "stances" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "stances_voter_idx" ON "stances" USING btree ("voter_pubkey");