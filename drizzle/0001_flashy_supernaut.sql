ALTER TABLE "posts" ADD COLUMN "mentions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "posts_mentions_idx" ON "posts" USING gin ("mentions");