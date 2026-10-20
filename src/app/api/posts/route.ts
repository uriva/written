import { NextRequest, NextResponse } from "next/server";
import { adminDb, createPostServer } from "@/lib/adminDb";
import { emitEvent } from "@/lib/webhooks";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get("tag")?.toLowerCase().replace(/^#/, "");
    const author = searchParams.get("author")?.toLowerCase();
    const replyTo = searchParams.get("replyTo");
    const topLevel = searchParams.get("topLevel") === "true";
    const q = searchParams.get("q")?.trim().toLowerCase();
    const before = parseNumber(searchParams.get("before"));
    const since = parseNumber(searchParams.get("since"));
    const requestedLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);
    const order: "asc" | "desc" =
      searchParams.get("order") === "asc" || (since && !searchParams.get("order"))
        ? "asc"
        : "desc";

    const whereClause: Record<string, any> = {};
    if (author) whereClause.authorPubkey = author;
    if (replyTo !== null && replyTo !== undefined) {
      whereClause.replyToId = replyTo;
    }
    if (before) whereClause.createdAt = { $lt: before };
    if (since) {
      whereClause.createdAt = { ...(whereClause.createdAt || {}), $gt: since };
    }

    // Keyword search is applied in memory because `content` is not indexed.
    // Fetch a larger window so matches aren't missed by the SQL limit.
    const fetchLimit = q ? 300 : limit;

    const { posts } = await adminDb.query({
      posts: {
        $: {
          where: (Object.keys(whereClause).length > 0 ? whereClause : undefined) as any,
          order: { createdAt: order },
          limit: fetchLimit,
        },
        profile: {},
        replies: {},
      },
    });

    let results: any[] = posts || [];

    if (topLevel) {
      results = results.filter((post) => !post.replyToId);
    }

    if (tag) {
      results = results.filter((post) => {
        if (!post.tags) return false;
        try {
          const parsed = JSON.parse(post.tags);
          return Array.isArray(parsed) && parsed.includes(tag);
        } catch {
          return false;
        }
      });
    }

    if (q) {
      results = results.filter((post) =>
        String(post.content || "").toLowerCase().includes(q)
      );
    }

    results = results.slice(0, limit);
    const last = results[results.length - 1];

    return NextResponse.json({
      success: true,
      count: results.length,
      nextCursor: results.length === limit && last ? last.createdAt : null,
      order,
      posts: results.map((post: any) => ({
        id: post.id,
        content: post.content,
        authorPubkey: post.authorPubkey || null,
        signed: Boolean(post.signed),
        signature: post.signature || null,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt || null,
        replyToId: post.replyToId || null,
        rootId: post.rootId || post.id,
        tags: post.tags ? JSON.parse(post.tags) : [],
        profile: post.profile
          ? {
              name: post.profile.name,
              bio: post.profile.bio || null,
              avatar: post.profile.avatar || null,
            }
          : null,
        repliesCount: post.replies?.length || 0,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(`posts:create:${getClientIp(req)}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Rate limit exceeded. Please wait before posting again.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const headerPubkey = req.headers.get("x-written-pubkey");
    const headerSignature = req.headers.get("x-written-signature");

    const content = body.content;
    const authorPubkey = body.authorPubkey || headerPubkey || null;
    const signature = body.signature || headerSignature || null;
    const createdAt = body.createdAt || Date.now();
    const replyToId = body.replyToId || null;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'content' is required and must be a string" },
        { status: 400 }
      );
    }

    const post = await createPostServer({
      content,
      authorPubkey,
      signature,
      createdAt,
      replyToId,
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
            profile: null,
          },
        },
        content: post.content,
        tags: post.tags,
        authorPubkey: post.authorPubkey || undefined,
        replyToId: post.replyToId || undefined,
        rootId: post.rootId || undefined,
      },
      { origin: getOrigin(req) }
    );

    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (error: any) {
    const message = error.message || "Failed to create post";
    const isClientError =
      message.includes("signature") ||
      message.includes("Invalid") ||
      message.includes("cannot be empty") ||
      message.includes("exceeds") ||
      message.includes("not found");

    return NextResponse.json(
      { success: false, error: message },
      { status: isClientError ? 400 : 500 }
    );
  }
}
