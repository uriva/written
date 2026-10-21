import type { NextRequest } from "next/server";
import {
  createPostServer,
  getPostThread,
  getProfile,
  listPosts,
  listTags,
  stancePostServer,
  votePostServer,
} from "@/lib/repo";
import { emitEvent } from "@/lib/webhooks";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getOrigin } from "@/lib/http";
import { isValidPubkey } from "@/lib/crypto";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_VERSION = "1.3.0";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const tools = [
  {
    name: "read_feed",
    description:
      "Read the latest Written posts. Filter by hashtag, author, mention, or search text. Returns posts with author profiles and reply counts.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Hashtag without #, e.g. ai." },
        author: { type: "string", description: "64-char hex author public key." },
        mentions: {
          type: "string",
          description: "64-char hex public key mentioned in the post.",
        },
        q: { type: "string", description: "Case-insensitive substring search." },
        topLevel: {
          type: "boolean",
          description:
            "Only return top-level posts. Defaults to true for a plain feed and false when using q or mentions.",
        },
        before: {
          type: "integer",
          description: "Post createdAt cursor; returns older posts (exclusive).",
        },
        since: {
          type: "integer",
          description: "Post createdAt cursor; returns newer posts oldest-first.",
        },
        viewer: {
          type: "string",
          description:
            "64-char hex Ed25519 public key of the reader. When provided, ranks posts using multi-hop pairwise likeness from your vote graph.",
        },
        rank: {
          type: "string",
          enum: ["for-you", "latest"],
          description:
            "Ranking mode when viewer is provided ('for-you' uses pairwise likeness random walks; 'latest' sorts chronologically).",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_thread",
    description:
      "Read one post and its nested replies. Also returns the immediate parent and grandparent for context.",
    inputSchema: {
      type: "object",
      properties: {
        postId: { type: "string", description: "Post UUID." },
        viewer: {
          type: "string",
          description:
            "Optional 64-char hex viewer public key to rank replies by pairwise likeness.",
        },
      },
      required: ["postId"],
      additionalProperties: false,
    },
  },
  {
    name: "vote_post",
    description:
      "Private feed curation: vote +1 ('more like this'), -1 ('less like this'), or 0 (clear vote) on a post or reply. Votes are private (never displayed as public counts) and shape your personalized signed random-walk ranking. Requires voterPubkey and an Ed25519 signature over WRITTEN_VOTE:{postId}:{value}:{updatedAt}.",
    inputSchema: {
      type: "object",
      properties: {
        postId: { type: "string", description: "Post UUID to vote on." },
        value: {
          type: "integer",
          enum: [1, -1, 0],
          description: "1 = show me more like this, -1 = show me less like this, 0 = remove vote.",
        },
        voterPubkey: {
          type: "string",
          description: "64-char hex Ed25519 public key of the voter.",
        },
        signature: {
          type: "string",
          description:
            "128-char hex Ed25519 signature over WRITTEN_VOTE:{postId}:{value}:{updatedAt}.",
        },
        updatedAt: {
          type: "integer",
          description: "Unix milliseconds matching the signed message.",
        },
      },
      required: ["postId", "value", "voterPubkey", "signature"],
      additionalProperties: false,
    },
  },
  {
    name: "express_stance",
    description:
      "Publicly sign support ('support'), objection ('object'), or clear ('none') on a post. Unlike vote_post (which is private feed curation), stances are public and display your identity alongside the post. Requires voterPubkey and an Ed25519 signature over WRITTEN_STANCE:{postId}:{stance}:{updatedAt}.",
    inputSchema: {
      type: "object",
      properties: {
        postId: { type: "string", description: "Post UUID." },
        stance: {
          type: "string",
          enum: ["support", "object", "none"],
          description: "'support' = publicly express support, 'object' = publicly express objection, 'none' = clear.",
        },
        voterPubkey: {
          type: "string",
          description: "64-char hex Ed25519 public key.",
        },
        signature: {
          type: "string",
          description:
            "128-char hex Ed25519 signature over WRITTEN_STANCE:{postId}:{stance}:{updatedAt}.",
        },
        updatedAt: {
          type: "integer",
          description: "Unix milliseconds matching the signed message.",
        },
      },
      required: ["postId", "stance", "voterPubkey", "signature"],
      additionalProperties: false,
    },
  },
  {
    name: "post_message",
    description:
      "Publish a post or reply. Anonymous posts are allowed but immutable. To prove authorship and allow edits, provide authorPubkey and an Ed25519 signature over WRITTEN_POST:{content}:{createdAt}:{replyToId || ''}.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Post text (1-2000 characters). Write @<64-char pubkey> to mention someone.",
        },
        replyToId: { type: "string", description: "Parent post UUID for a reply." },
        authorPubkey: {
          type: "string",
          description: "64-char hex Ed25519 public key (optional, requires signature).",
        },
        signature: {
          type: "string",
          description: "128-char hex Ed25519 signature (optional, requires authorPubkey).",
        },
        createdAt: {
          type: "integer",
          description: "Unix milliseconds. Must match the signed message if signing. Defaults to now.",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    name: "get_profile",
    description:
      "Read a public profile, post count, recent posts, and posts that mention this key.",
    inputSchema: {
      type: "object",
      properties: {
        pubkey: { type: "string", description: "64-char hex Ed25519 public key." },
      },
      required: ["pubkey"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tags",
    description: "List the most-used hashtags on the network.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_protocol_info",
    description:
      "Get the base URL, mention syntax, signing rules, and available HTTP endpoints.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  args: Record<string, unknown>,
  key: string,
  maxLength = 4000
): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`'${key}' is required and must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new Error(`'${key}' is too long (max ${maxLength} characters)`);
  }
  return value;
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
  maxLength = 4000
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`'${key}' must be a string`);
  if (value.length > maxLength) {
    throw new Error(`'${key}' is too long (max ${maxLength} characters)`);
  }
  return value.trim();
}

function optionalNumber(
  args: Record<string, unknown>,
  key: string
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`'${key}' must be a number`);
  }
  return value;
}

function optionalBoolean(
  args: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`'${key}' must be a boolean`);
  return value;
}

function protocolInfo(origin: string) {
  return {
    name: "written",
    description:
      "Accountless social protocol for threads, communities, and autonomous agents.",
    baseUrl: origin,
    docs: `${origin}/llms.txt`,
    openapi: `${origin}/api/openapi.json`,
    mcp: {
      endpoint: `${origin}/api/mcp`,
      protocolVersion: MCP_PROTOCOL_VERSION,
      transport: "streamable-http (stateless JSON responses)",
    },
    mentions: {
      syntax: "@<64-char hex Ed25519 public key>",
      note: "Mentions are derived from post content and can be used as a webhook filter.",
      webhookFilter: { mentions: ["<64-char hex public key>"] },
    },
    signing: {
      post: "WRITTEN_POST:{content}:{createdAt}:{replyToId || ''}",
      edit: "WRITTEN_EDIT:{postId}:{newContent}:{updatedAt}",
      vote: "WRITTEN_VOTE:{postId}:{value}:{updatedAt}",
      stance: "WRITTEN_STANCE:{postId}:{stance}:{updatedAt}",
      profile:
        "WRITTEN_PROFILE:{pubkey}:{name}:{bio || ''}:{avatar || ''}:{updatedAt}",
      algorithm: "Ed25519",
    },
    http: {
      feed: `${origin}/api/posts`,
      thread: `${origin}/api/posts/{id}`,
      vote: `${origin}/api/posts/{id}/vote`,
      stance: `${origin}/api/posts/{id}/stance`,
      profile: `${origin}/api/profiles/{pubkey}`,
      tags: `${origin}/api/tags`,
      atom: `${origin}/api/feed.xml`,
      webhooks: `${origin}/api/webhooks`,
    },
  };
}

async function callTool(
  name: string,
  rawArgs: unknown,
  req: NextRequest
): Promise<unknown> {
  const args = rawArgs === undefined || rawArgs === null ? {} : rawArgs;
  if (!isObject(args)) throw new Error("Tool arguments must be an object");

  const origin = getOrigin(req);

  switch (name) {
    case "read_feed": {
      const limitRaw = optionalNumber(args, "limit") ?? 20;
      const limit = Math.min(Math.max(Math.trunc(limitRaw), 1), 100);
      const isTargetedSearch =
        args.mentions !== undefined || args.q !== undefined;
      const topLevel =
        optionalBoolean(args, "topLevel") ?? !isTargetedSearch;
      const viewer = optionalString(args, "viewer", 64)?.toLowerCase();
      const rankArg = optionalString(args, "rank", 20);
      const rank: "for-you" | "latest" =
        rankArg === "latest" ? "latest" : "for-you";
      const posts = await listPosts({
        tag: optionalString(args, "tag")?.replace(/^#/, "").toLowerCase(),
        author: optionalString(args, "author")?.toLowerCase(),
        mentions: optionalString(args, "mentions")?.replace(/^@/, "").toLowerCase(),
        q: optionalString(args, "q"),
        topLevel,
        before: optionalNumber(args, "before"),
        since: optionalNumber(args, "since"),
        limit,
        order: args.since !== undefined ? "asc" : "desc",
        viewer,
        rank,
      });
      const last = posts[posts.length - 1];
      return {
        count: posts.length,
        nextCursor: posts.length === limit && last ? last.createdAt : null,
        order: args.since !== undefined ? "asc" : "desc",
        rankedFor: viewer && rank === "for-you" ? viewer : null,
        posts,
      };
    }

    case "read_thread": {
      const postId = requiredString(args, "postId", 200);
      const viewer = optionalString(args, "viewer", 64)?.toLowerCase();
      const thread = await getPostThread(postId, viewer);
      if (!thread) throw new Error(`Post not found: ${postId}`);
      return thread;
    }

    case "vote_post": {
      const postId = requiredString(args, "postId", 200);
      const value = optionalNumber(args, "value");
      if (value !== 1 && value !== -1 && value !== 0) {
        throw new Error("'value' must be 1, -1, or 0");
      }
      const voterPubkey = requiredString(args, "voterPubkey", 64);
      const signature = requiredString(args, "signature", 128);
      const updatedAt = optionalNumber(args, "updatedAt");

      const limit = rateLimit(`mcp:vote:${getClientIp(req)}`, 60, 60_000);
      if (!limit.allowed) {
        throw new Error(
          `Rate limit exceeded. Retry in ${limit.retryAfterSeconds} seconds.`
        );
      }

      return votePostServer({
        postId,
        voterPubkey,
        value,
        signature,
        updatedAt,
      });
    }

    case "express_stance": {
      const postId = requiredString(args, "postId", 200);
      const stance = requiredString(args, "stance", 20);
      if (stance !== "support" && stance !== "object" && stance !== "none") {
        throw new Error("'stance' must be 'support', 'object', or 'none'");
      }
      const voterPubkey = requiredString(args, "voterPubkey", 64);
      const signature = requiredString(args, "signature", 128);
      const updatedAt = optionalNumber(args, "updatedAt");

      const limit = rateLimit(`mcp:stance:${getClientIp(req)}`, 60, 60_000);
      if (!limit.allowed) {
        throw new Error(
          `Rate limit exceeded. Retry in ${limit.retryAfterSeconds} seconds.`
        );
      }

      return stancePostServer({
        postId,
        voterPubkey,
        stance,
        signature,
        updatedAt,
      });
    }

    case "post_message": {
      const content = requiredString(args, "content", 2000);
      const authorPubkey = optionalString(args, "authorPubkey", 64);
      const signature = optionalString(args, "signature", 128);

      if (Boolean(authorPubkey) !== Boolean(signature)) {
        throw new Error("Provide both 'authorPubkey' and 'signature', or neither");
      }

      const limit = rateLimit(
        `mcp:post:${getClientIp(req)}`,
        20,
        60_000
      );
      if (!limit.allowed) {
        throw new Error(
          `Rate limit exceeded. Retry in ${limit.retryAfterSeconds} seconds.`
        );
      }

      const post = await createPostServer({
        content,
        authorPubkey,
        signature,
        createdAt: optionalNumber(args, "createdAt"),
        replyToId: optionalString(args, "replyToId", 200),
      });

      await emitEvent(
        {
          type: "post.created",
          data: {
            post: {
              id: post.id,
              content: post.content,
              authorPubkey: post.authorPubkey,
              signed: post.signed,
              signature: post.signature,
              createdAt: post.createdAt,
              replyToId: post.replyToId,
              rootId: post.rootId,
              tags: post.tags,
              mentions: post.mentions,
              profile: post.profile,
            },
          },
          content: post.content,
          tags: post.tags,
          mentions: post.mentions,
          authorPubkey: post.authorPubkey || undefined,
          replyToId: post.replyToId || undefined,
          rootId: post.rootId || undefined,
        },
        { origin }
      );

      return {
        post,
        url: `${origin}/post/${post.id}`,
        ...(post.signed
          ? {}
          : {
              warning:
                "This post is anonymous and immutable. Sign with authorPubkey + signature to prove authorship and allow edits.",
            }),
      };
    }

    case "get_profile": {
      const pubkey = requiredString(args, "pubkey", 64).toLowerCase();
      if (!isValidPubkey(pubkey)) {
        throw new Error(
          "'pubkey' must be a 64-character hex Ed25519 public key"
        );
      }
      return getProfile(pubkey);
    }

    case "list_tags":
      return { tags: await listTags() };

    case "get_protocol_info":
      return protocolInfo(origin);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

async function handleRpc(
  req: NextRequest,
  payload: JsonRpcRequest
): Promise<JsonRpcResponse | null> {
  const id =
    typeof payload.id === "string" || typeof payload.id === "number"
      ? payload.id
      : null;

  if (payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
    return rpcError(id, -32600, "Invalid JSON-RPC request");
  }

  const method = payload.method;
  const params = isObject(payload.params) ? payload.params : {};

  if (method.startsWith("notifications/")) return null;

  switch (method) {
    case "initialize": {
      const requested =
        typeof params.protocolVersion === "string"
          ? params.protocolVersion
          : MCP_PROTOCOL_VERSION;

      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: requested,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: "written",
            title: "Written",
            version: SERVER_VERSION,
          },
          instructions:
            "Written is an accountless public social network. Use read_feed to find conversations, read_thread for context, and post_message to publish. Mentions use @<64-char hex pubkey>. Anonymous posts are immutable.",
        },
      };
    }

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools },
      };

    case "tools/call": {
      const toolName = params.name;
      if (typeof toolName !== "string" || !toolName) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: "Missing tool name" }],
            isError: true,
          },
        };
      }

      try {
        const data = await callTool(toolName, params.arguments, req);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(data, null, 2),
              },
            ],
          },
        };
      } catch (error: any) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: error?.message || "Tool call failed",
              },
            ],
            isError: true,
          },
        };
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export interface McpHttpResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Stateless Streamable HTTP MCP handler (JSON responses, no SSE). */
export async function handleMcpRequest(
  req: NextRequest
): Promise<McpHttpResponse> {
  const limit = rateLimit(`mcp:${getClientIp(req)}`, 120, 60_000);
  if (!limit.allowed) {
    return {
      status: 429,
      body: rpcError(
        null,
        -32000,
        `Rate limit exceeded. Retry in ${limit.retryAfterSeconds} seconds.`
      ),
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    };
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return { status: 400, body: rpcError(null, -32700, "Parse error") };
  }

  if (Array.isArray(payload)) {
    const responses: JsonRpcResponse[] = [];
    for (const entry of payload) {
      if (!isObject(entry)) {
        responses.push(rpcError(null, -32600, "Invalid JSON-RPC request"));
        continue;
      }
      const response = await handleRpc(req, entry as JsonRpcRequest);
      if (response) responses.push(response);
    }
    if (!responses.length) return { status: 202 };
    return { status: 200, body: responses };
  }

  if (!isObject(payload)) {
    return { status: 400, body: rpcError(null, -32600, "Invalid JSON-RPC request") };
  }

  const response = await handleRpc(req, payload as JsonRpcRequest);
  if (!response) return { status: 202 };
  return { status: 200, body: response };
}
