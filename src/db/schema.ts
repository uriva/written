import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import type { NormalizedWebhookFilters } from "../lib/webhookTypes";

export interface EditHistoryEntry {
  content: string;
  signature: string | null;
  authorPubkey: string | null;
  updatedAt: number;
  editSignature: string;
}

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    authorPubkey: text("author_pubkey"),
    signature: text("signature"),
    signed: boolean("signed").notNull().default(false),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }),
    replyToId: text("reply_to_id"),
    rootId: text("root_id"),
    tags: text("tags").array().notNull().default([]),
    mentions: text("mentions").array().notNull().default([]),
    editHistory: jsonb("edit_history")
      .$type<EditHistoryEntry[]>()
      .notNull()
      .default([]),
  },
  (table) => [
    index("posts_created_at_idx").on(table.createdAt),
    index("posts_author_idx").on(table.authorPubkey),
    index("posts_reply_to_idx").on(table.replyToId),
    index("posts_root_idx").on(table.rootId),
    index("posts_tags_idx").using("gin", table.tags),
    index("posts_mentions_idx").using("gin", table.mentions),
  ]
);

export const profiles = pgTable(
  "profiles",
  {
    pubkey: text("pubkey").primaryKey(),
    name: text("name").notNull(),
    bio: text("bio"),
    avatar: text("avatar"),
    signature: text("signature"),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("profiles_updated_at_idx").on(table.updatedAt)]
);

export const tags = pgTable(
  "tags",
  {
    name: text("name").primaryKey(),
    postCount: integer("post_count").notNull().default(1),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [index("tags_post_count_idx").on(table.postCount)]
);

export const webhooks = pgTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    ownerPubkey: text("owner_pubkey").notNull(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    description: text("description"),
    filters: jsonb("filters").$type<NormalizedWebhookFilters>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    lastDeliveryAt: bigint("last_delivery_at", { mode: "number" }),
    failureCount: integer("failure_count").notNull().default(0),
    disabledReason: text("disabled_reason"),
  },
  (table) => [
    index("webhooks_owner_idx").on(table.ownerPubkey),
    index("webhooks_active_idx").on(table.active),
  ]
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id").notNull(),
    ownerPubkey: text("owner_pubkey").notNull(),
    event: text("event").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    error: text("error"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    nextAttemptAt: bigint("next_attempt_at", { mode: "number" }).notNull(),
    deliveredAt: bigint("delivered_at", { mode: "number" }),
  },
  (table) => [
    index("webhook_deliveries_webhook_idx").on(table.webhookId),
    index("webhook_deliveries_status_idx").on(table.status, table.nextAttemptAt),
  ]
);

export const votes = pgTable(
  "votes",
  {
    postId: text("post_id").notNull(),
    voterPubkey: text("voter_pubkey").notNull(),
    value: integer("value").notNull(), // +1 ("more of this") or -1 ("less of this")
    signature: text("signature").notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.voterPubkey] }),
    index("votes_post_idx").on(table.postId),
    index("votes_voter_idx").on(table.voterPubkey),
    index("votes_updated_at_idx").on(table.updatedAt),
  ]
);
