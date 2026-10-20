CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"author_pubkey" text,
	"signature" text,
	"signed" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint,
	"reply_to_id" text,
	"root_id" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"edit_history" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"pubkey" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"avatar" text,
	"signature" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"name" text PRIMARY KEY NOT NULL,
	"post_count" integer DEFAULT 1 NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"owner_pubkey" text NOT NULL,
	"event" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"next_attempt_at" bigint NOT NULL,
	"delivered_at" bigint
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_pubkey" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"description" text,
	"filters" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"last_delivery_at" bigint,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"disabled_reason" text
);
--> statement-breakpoint
CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_pubkey");--> statement-breakpoint
CREATE INDEX "posts_reply_to_idx" ON "posts" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "posts_root_idx" ON "posts" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "posts_tags_idx" ON "posts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "profiles_updated_at_idx" ON "profiles" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "tags_post_count_idx" ON "tags" USING btree ("post_count");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_idx" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhooks_owner_idx" ON "webhooks" USING btree ("owner_pubkey");--> statement-breakpoint
CREATE INDEX "webhooks_active_idx" ON "webhooks" USING btree ("active");