import { init, id, type InstaQLEntity } from "@instantdb/react";
import schema, { type AppSchema } from "@/instant.schema";

export const APP_ID =
  process.env.NEXT_PUBLIC_INSTANT_APP_ID || "fe53f2bb-9774-47db-9ed6-8c7c2dab43a5";

export const API_URI =
  process.env.NEXT_PUBLIC_INSTANT_API_URI || "https://api.instantdb.uriv.me";

export const WS_URI =
  process.env.NEXT_PUBLIC_INSTANT_WS_URI || "wss://api.instantdb.uriv.me/runtime/session";

export const db = init({
  appId: APP_ID,
  apiURI: API_URI,
  websocketURI: WS_URI,
  schema,
});

export { id };

export type Post = InstaQLEntity<
  AppSchema,
  "posts",
  { profile: {}; replies: {}; parent: {} }
>;
export type Profile = InstaQLEntity<AppSchema, "profiles">;
export type Tag = InstaQLEntity<AppSchema, "tags">;
export type UserKey = InstaQLEntity<AppSchema, "userKeys">;
