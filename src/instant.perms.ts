// Docs: https://www.instantdb.com/docs/permissions
import type { InstantRules } from "@instantdb/core";

const rules = {
  $users: {
    allow: {
      view: "auth.id == data.id",
    },
  },
  posts: {
    allow: {
      // Reads are public; all writes go through the server API, which
      // validates signatures and enforces rate limits.
      view: "true",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  tags: {
    allow: {
      view: "true",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  profiles: {
    allow: {
      view: "true",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  webhooks: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  webhookDeliveries: {
    allow: {
      view: "false",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
  userKeys: {
    bind: ["isOwner", "auth.id in data.ref('user.id')"],
    allow: {
      view: "isOwner",
      create: "auth.id != null",
      update: "isOwner",
      delete: "isOwner",
    },
  },
} satisfies InstantRules;

export default rules;
