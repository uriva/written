// Docs: https://www.instantdb.com/docs/modeling-data
import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    posts: i.entity({
      content: i.string(),
      authorPubkey: i.string().indexed().optional(),
      signature: i.string().optional(),
      signed: i.boolean().indexed(),
      createdAt: i.number().indexed(),
      updatedAt: i.number().indexed().optional(),
      replyToId: i.string().indexed().optional(),
      rootId: i.string().indexed().optional(),
      tags: i.string().optional(), // JSON array string: '["protocol","minimal"]'
      editHistory: i.string().optional(), // JSON array of { content, signature, editedAt }
    }),
    tags: i.entity({
      name: i.string().unique().indexed(),
      postCount: i.number().indexed(),
      updatedAt: i.number().indexed(),
    }),
    profiles: i.entity({
      pubkey: i.string().unique().indexed(),
      name: i.string(),
      bio: i.string().optional(),
      avatar: i.string().optional(),
      signature: i.string().optional(),
      updatedAt: i.number().indexed(),
    }),
    userKeys: i.entity({
      pubkey: i.string().indexed(),
      privateKey: i.string(),
      createdAt: i.number(),
      updatedAt: i.number(),
    }),
    webhooks: i.entity({
      ownerPubkey: i.string().indexed(),
      url: i.string(),
      secret: i.string(),
      description: i.string().optional(),
      filters: i.string(), // JSON: { keywords, tags, authors, replyToId, rootId }
      active: i.boolean().indexed(),
      createdAt: i.number().indexed(),
      updatedAt: i.number().indexed(),
      lastDeliveryAt: i.number().optional(),
      failureCount: i.number().optional(),
      disabledReason: i.string().optional(),
    }),
    webhookDeliveries: i.entity({
      webhookId: i.string().indexed(),
      ownerPubkey: i.string().indexed(),
      event: i.string().indexed(),
      payload: i.string(),
      status: i.string().indexed(), // pending | success | failed | skipped
      attempts: i.number(),
      responseStatus: i.number().optional(),
      error: i.string().optional(),
      createdAt: i.number().indexed(),
      updatedAt: i.number(),
      nextAttemptAt: i.number().indexed(),
      deliveredAt: i.number().optional(),
    }),
  },
  links: {
    postAuthorProfile: {
      forward: { on: "posts", has: "one", label: "profile" },
      reverse: { on: "profiles", has: "many", label: "posts" },
    },
    postReplies: {
      forward: { on: "posts", has: "many", label: "replies" },
      reverse: { on: "posts", has: "one", label: "parent" },
    },
    userAccountKeys: {
      forward: { on: "userKeys", has: "one", label: "user", onDelete: "cascade" },
      reverse: { on: "$users", has: "many", label: "userKeys" },
    },
  },
  rooms: {},
});

type _AppSchema = typeof _schema;
type AppSchema = _AppSchema;
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
