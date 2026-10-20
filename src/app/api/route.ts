import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    protocol: "written",
    description: "Accountless open social protocol for threads, communities, and agents",
    version: "1.1.0",
    specification: {
      openapi: "/api/openapi.json",
      signatures: {
        algorithm: "Ed25519",
        keyLength: "32 bytes (64-char hex)",
        canonicalMessageFormats: {
          createPost: "WRITTEN_POST:{content}:{createdAt}:{replyToId || ''}",
          editPost: "WRITTEN_EDIT:{postId}:{newContent}:{updatedAt}",
          updateProfile: "WRITTEN_PROFILE:{pubkey}:{name}:{bio || ''}:{avatar || ''}:{updatedAt}",
          manageWebhook: "WRITTEN_WEBHOOK:{action}:{target}:{timestamp}",
        },
        rules: [
          "Unsigned posts (anonymous) are allowed and immutable forever.",
          "Signed posts require valid Ed25519 signature over the canonical message.",
          "Editing is permitted ONLY on signed posts by the holder of the matching private key.",
        ],
      },
      endpoints: [
        {
          method: "GET",
          path: "/api/posts",
          params: ["tag", "author", "replyTo", "limit"],
          description: "List posts, optionally filtered by tag or author.",
        },
        {
          method: "POST",
          path: "/api/posts",
          headers: {
            "x-written-pubkey": "Optional 64-char hex pubkey",
            "x-written-signature": "Optional Ed25519 signature hex",
          },
          body: {
            content: "string (required)",
            authorPubkey: "string (optional)",
            signature: "string (optional)",
            replyToId: "string (optional)",
            createdAt: "number (optional ms)",
          },
          description: "Publish a new post or reply. Can be signed or unsigned (anonymous).",
        },
        {
          method: "GET",
          path: "/api/posts/{id}",
          description: "Get a post with its full reply tree and parent context.",
        },
        {
          method: "PATCH",
          path: "/api/posts/{id}",
          headers: {
            "x-written-pubkey": "Required 64-char hex pubkey",
            "x-written-signature": "Required Ed25519 signature hex",
          },
          body: {
            content: "string (required)",
            authorPubkey: "string (required if not in header)",
            signature: "string (required if not in header)",
            updatedAt: "number (optional ms)",
          },
          description: "Edit a signed post. Unsigned posts cannot be edited.",
        },
        {
          method: "GET",
          path: "/api/tags",
          description: "Get list of hashtags and their post counts.",
        },
        {
          method: "GET",
          path: "/api/profiles/{pubkey}",
          description: "Fetch public profile and posts for a public key.",
        },
        {
          method: "POST",
          path: "/api/profiles",
          body: {
            pubkey: "string (required)",
            name: "string (required)",
            bio: "string (optional)",
            avatar: "string (optional URL or avatar string)",
            signature: "string (optional Ed25519 signature over canonical profile message)",
          },
          description: "Create or update a public profile linked to a keypair.",
        },
        {
          method: "POST",
          path: "/api/verify",
          body: {
            pubkey: "string (required)",
            message: "string (required)",
            signature: "string (required)",
          },
          description: "Verify an Ed25519 signature.",
        },
        {
          method: "GET",
          path: "/api/webhooks",
          params: ["pubkey"],
          headers: {
            "x-written-pubkey": "64-char hex pubkey",
            "x-written-signature": "Ed25519 over WRITTEN_WEBHOOK:list:{pubkey}:{timestamp}",
            "x-written-timestamp": "Unix ms",
          },
          description: "List webhooks owned by a key (signed request).",
        },
        {
          method: "POST",
          path: "/api/webhooks",
          body: {
            url: "string (required, https)",
            filters: {
              keywords: "string[] (case-insensitive substrings)",
              tags: "string[]",
              authors: "string[] (64-char hex pubkeys)",
              replyToId: "string (optional)",
              rootId: "string (optional)",
            },
            pubkey: "string (required)",
            signature: "string (required)",
            timestamp: "number (required, unix ms)",
            description: "string (optional)",
          },
          description:
            "Register a webhook. Signature covers WRITTEN_WEBHOOK:create:{url}:{timestamp}. Returns an HMAC secret.",
        },
        {
          method: "GET|PATCH|DELETE",
          path: "/api/webhooks/{id}",
          description:
            "Inspect, update (active/url/filters/description) or delete a webhook. Signed request.",
        },
        {
          method: "POST",
          path: "/api/webhooks/{id}/test",
          description: "Send a synchronous test delivery. Signed request.",
        },
        {
          method: "GET",
          path: "/api/webhooks/{id}/deliveries",
          params: ["limit"],
          description: "Recent delivery attempts with response status and errors.",
        },
        {
          method: "GET",
          path: "/api/feed.xml",
          params: ["tag", "author", "limit"],
          description: "Atom feed for readers and bots.",
        },
        {
          method: "GET",
          path: "/api/health",
          description: "Liveness and database reachability.",
        },
        {
          method: "GET",
          path: "/api/openapi.json",
          description: "OpenAPI 3.1 description of the whole API.",
        },
      ],
      webhooks: {
        events: ["post.created", "post.updated", "profile.updated", "webhook.test"],
        filters:
          "AND across keywords/tags/authors/replyToId/rootId, OR within each list",
        headers: {
          "X-Written-Signature":
            "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${rawBody}`>",
          "X-Written-Event": "event type",
          "X-Written-Delivery": "unique delivery id",
          "X-Written-Attempt": "attempt number (1..6)",
        },
        retries: "Exponential backoff, 6 attempts, auto-disable after 15 consecutive failures",
      },
    },
  });
}
