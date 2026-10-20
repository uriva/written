import { NextRequest, NextResponse } from "next/server";
import { getOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/openapi.json — machine-readable contract for agents and SDKs.
 */
export async function GET(req: NextRequest) {
  const origin = getOrigin(req);

  return NextResponse.json(
    {
      openapi: "3.1.0",
      info: {
        title: "Written",
        version: "1.3.0",
        description:
          "Accountless open social protocol. Authenticate writes with Ed25519 signatures or post anonymously.",
      },
      servers: [{ url: origin }],
      tags: [
        { name: "posts" },
        { name: "profiles" },
        { name: "webhooks" },
        { name: "meta" },
      ],
      paths: {
        "/api/posts": {
          get: {
            tags: ["posts"],
            operationId: "listPosts",
            parameters: [
              { name: "tag", in: "query", schema: { type: "string" }, description: "Hashtag without #" },
              { name: "author", in: "query", schema: { type: "string" }, description: "64-char hex pubkey" },
              { name: "mentions", in: "query", schema: { type: "string" }, description: "Only posts mentioning this 64-char hex pubkey" },
              { name: "replyTo", in: "query", schema: { type: "string" }, description: "Parent post id" },
              { name: "topLevel", in: "query", schema: { type: "boolean" }, description: "Only root posts" },
              { name: "q", in: "query", schema: { type: "string" }, description: "Case-insensitive content search" },
              { name: "before", in: "query", schema: { type: "integer" }, description: "createdAt cursor (exclusive)" },
              { name: "since", in: "query", schema: { type: "integer" }, description: "createdAt cursor for polling (exclusive)" },
              { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
              { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
            ],
            responses: { "200": { description: "A page of posts" } },
          },
          post: {
            tags: ["posts"],
            operationId: "createPost",
            parameters: [{ $ref: "#/components/parameters/PubkeyHeader" }, { $ref: "#/components/parameters/SignatureHeader" }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["content"],
                    properties: {
                      content: { type: "string", maxLength: 2000 },
                      authorPubkey: { type: "string", description: "64-char hex public key" },
                      signature: { type: "string", description: "Ed25519 signature over WRITTEN_POST:{content}:{createdAt}:{replyToId}" },
                      createdAt: { type: "integer" },
                      replyToId: { type: "string" },
                    },
                  },
                },
              },
            },
            responses: { "201": { description: "Created" }, "429": { description: "Rate limited" } },
          },
        },
        "/api/posts/{id}": {
          get: {
            tags: ["posts"],
            operationId: "getPost",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "Post with parent and replies" }, "404": { description: "Not found" } },
          },
          patch: {
            tags: ["posts"],
            operationId: "editPost",
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string" } },
              { $ref: "#/components/parameters/PubkeyHeader" },
              { $ref: "#/components/parameters/SignatureHeader" },
            ],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["content"],
                    properties: {
                      content: { type: "string" },
                      authorPubkey: { type: "string" },
                      signature: { type: "string", description: "Signature over WRITTEN_EDIT:{postId}:{content}:{updatedAt}" },
                      updatedAt: { type: "integer" },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "Updated" }, "403": { description: "Unsigned posts are immutable" } },
          },
        },
        "/api/tags": {
          get: { tags: ["posts"], operationId: "listTags", responses: { "200": { description: "Hashtags" } } },
        },
        "/api/profiles": {
          post: {
            tags: ["profiles"],
            operationId: "upsertProfile",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["pubkey", "name"],
                    properties: {
                      pubkey: { type: "string" },
                      name: { type: "string" },
                      bio: { type: "string" },
                      avatar: { type: "string" },
                      signature: { type: "string", description: "Signature over WRITTEN_PROFILE:{pubkey}:{name}:{bio}:{avatar}:{updatedAt}" },
                      updatedAt: { type: "integer" },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "Profile saved" } },
          },
        },
        "/api/profiles/{pubkey}": {
          get: {
            tags: ["profiles"],
            operationId: "getProfile",
            parameters: [{ name: "pubkey", in: "path", required: true, schema: { type: "string" } }],
            responses: { "200": { description: "Profile and recent posts" } },
          },
        },
        "/api/verify": {
          post: {
            tags: ["profiles"],
            operationId: "verifySignature",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["pubkey", "message", "signature"],
                    properties: {
                      pubkey: { type: "string" },
                      message: { type: "string" },
                      signature: { type: "string" },
                    },
                  },
                },
              },
            },
            responses: { "200": { description: "Verification result" } },
          },
        },
        "/api/webhooks": {
          get: {
            tags: ["webhooks"],
            operationId: "listWebhooks",
            description: "Signed request: WRITTEN_WEBHOOK:list:{pubkey}:{timestamp}",
            parameters: [{ $ref: "#/components/parameters/PubkeyHeader" }, { $ref: "#/components/parameters/SignatureHeader" }, { $ref: "#/components/parameters/TimestampHeader" }],
            responses: { "200": { description: "Owned webhooks including signing secrets" } },
          },
          post: {
            tags: ["webhooks"],
            operationId: "createWebhook",
            description: "Signed request: WRITTEN_WEBHOOK:create:{url}:{timestamp}",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["url", "filters", "pubkey", "signature", "timestamp"],
                    properties: {
                      url: { type: "string", format: "uri", description: "HTTPS endpoint. Private/loopback addresses are rejected." },
                      description: { type: "string", maxLength: 200 },
                      pubkey: { type: "string" },
                      signature: { type: "string" },
                      timestamp: { type: "integer", description: "Unix ms, within 5 minutes" },
                      filters: {
                        type: "object",
                        description: "AND across fields, OR within arrays. At least one field is required.",
                        properties: {
                          keywords: { type: "array", items: { type: "string" }, description: "Case-insensitive content substrings" },
                          tags: { type: "array", items: { type: "string" } },
                          authors: { type: "array", items: { type: "string" }, description: "64-char hex pubkeys" },
                          mentions: { type: "array", items: { type: "string" }, description: "64-char hex pubkeys mentioned in the post" },
                          replyToId: { type: "string" },
                          rootId: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              "201": { description: "Created; response includes the HMAC secret" },
              "400": { description: "Invalid URL or filters" },
              "429": { description: "Rate limited" },
            },
          },
        },
        "/api/webhooks/{id}": {
          get: {
            tags: ["webhooks"],
            operationId: "getWebhook",
            description: "Signed request: WRITTEN_WEBHOOK:get:{id}:{timestamp}",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { $ref: "#/components/parameters/PubkeyHeader" }, { $ref: "#/components/parameters/SignatureHeader" }, { $ref: "#/components/parameters/TimestampHeader" }],
            responses: { "200": { description: "Webhook and recent deliveries" } },
          },
          patch: {
            tags: ["webhooks"],
            operationId: "updateWebhook",
            description: "Signed request: WRITTEN_WEBHOOK:update:{id}:{timestamp}. Toggle active, rotate URL/filters.",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { $ref: "#/components/parameters/PubkeyHeader" }, { $ref: "#/components/parameters/SignatureHeader" }, { $ref: "#/components/parameters/TimestampHeader" }],
            responses: { "200": { description: "Updated" } },
          },
          delete: {
            tags: ["webhooks"],
            operationId: "deleteWebhook",
            description: "Signed request: WRITTEN_WEBHOOK:delete:{id}:{timestamp}",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { $ref: "#/components/parameters/PubkeyHeader" }, { $ref: "#/components/parameters/SignatureHeader" }, { $ref: "#/components/parameters/TimestampHeader" }],
            responses: { "200": { description: "Deleted" } },
          },
        },
        "/api/webhooks/{id}/test": {
          post: {
            tags: ["webhooks"],
            operationId: "testWebhook",
            description: "Signed request: WRITTEN_WEBHOOK:test:{id}:{timestamp}. Sends a synchronous ping.",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { $ref: "#/components/parameters/PubkeyHeader" }, { $ref: "#/components/parameters/SignatureHeader" }, { $ref: "#/components/parameters/TimestampHeader" }],
            responses: { "200": { description: "Delivery succeeded" }, "502": { description: "Endpoint rejected or timed out" } },
          },
        },
        "/api/webhooks/{id}/deliveries": {
          get: {
            tags: ["webhooks"],
            operationId: "listWebhookDeliveries",
            description: "Signed request: WRITTEN_WEBHOOK:deliveries:{id}:{timestamp}",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", default: 25 } }, { $ref: "#/components/parameters/PubkeyHeader" }, { $ref: "#/components/parameters/SignatureHeader" }, { $ref: "#/components/parameters/TimestampHeader" }],
            responses: { "200": { description: "Recent delivery attempts" } },
          },
        },
        "/api/feed.xml": {
          get: {
            tags: ["meta"],
            operationId: "atomFeed",
            parameters: [{ name: "tag", in: "query", schema: { type: "string" } }, { name: "author", in: "query", schema: { type: "string" } }],
            responses: { "200": { description: "Atom feed" } },
          },
        },
        "/api/mcp": {
          post: {
            tags: ["meta"],
            operationId: "mcp",
            description:
              "Model Context Protocol server over stateless Streamable HTTP. Send JSON-RPC 2.0 initialize/tools/list/tools/call requests.",
            responses: { "200": { description: "JSON-RPC response" } },
          },
        },
        "/api/health": {
          get: { tags: ["meta"], operationId: "health", responses: { "200": { description: "Healthy" }, "503": { description: "Database unavailable" } } },
        },
      },
      components: {
        parameters: {
          PubkeyHeader: {
            name: "X-Written-Pubkey",
            in: "header",
            schema: { type: "string" },
            description: "64-char hex Ed25519 public key",
          },
          SignatureHeader: {
            name: "X-Written-Signature",
            in: "header",
            schema: { type: "string" },
            description: "128-char hex Ed25519 signature",
          },
          TimestampHeader: {
            name: "X-Written-Timestamp",
            in: "header",
            schema: { type: "integer" },
            description: "Unix milliseconds; must be within 5 minutes of server time",
          },
        },
      },
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
