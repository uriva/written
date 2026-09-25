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
