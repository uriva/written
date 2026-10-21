import { NextRequest, NextResponse } from "next/server";
import { createPostServer, listPosts } from "@/lib/repo";
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
    const mentions = searchParams.get("mentions")?.replace(/^@/, "").toLowerCase();
    const replyToParam = searchParams.get("replyTo");
    const replyTo =
      replyToParam === null ? undefined : replyToParam.trim() || null;
    const topLevel = searchParams.get("topLevel") === "true";
    const q = searchParams.get("q")?.trim();
    const before = parseNumber(searchParams.get("before"));
    const since = parseNumber(searchParams.get("since"));
    const requestedLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1),
      100
    );
    const order: "asc" | "desc" =
      searchParams.get("order") === "asc" || (since && !searchParams.get("order"))
        ? "asc"
        : "desc";
    const viewer =
      searchParams.get("viewer")?.toLowerCase() ||
      req.headers.get("x-written-pubkey")?.toLowerCase() ||
      null;
    const rankParam = searchParams.get("rank");
    const rank: "for-you" | "latest" =
      rankParam === "latest" ? "latest" : "for-you";

    const results = await listPosts({
      tag,
      author,
      mentions,
      replyTo,
      topLevel,
      q,
      before,
      since,
      limit,
      order,
      viewer,
      rank,
    });

    const last = results[results.length - 1];

    return NextResponse.json({
      success: true,
      count: results.length,
      nextCursor: results.length === limit && last ? last.createdAt : null,
      order,
      rankedFor: viewer && rank === "for-you" ? viewer : null,
      posts: results.map((post) => ({
        id: post.id,
        content: post.content,
        authorPubkey: post.authorPubkey,
        signed: post.signed,
        signature: post.signature,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        replyToId: post.replyToId,
        rootId: post.rootId,
        tags: post.tags,
        mentions: post.mentions,
        profile: post.profile,
        repliesCount: post.repliesCount ?? 0,
        upvotesCount: post.upvotesCount ?? 0,
        downvotesCount: post.downvotesCount ?? 0,
        viewerVote: post.viewerVote ?? 0,
        likenessScore: post.likenessScore ?? 0,
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
