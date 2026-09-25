import { NextRequest, NextResponse } from "next/server";
import { adminDb, createPostServer } from "@/lib/adminDb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get("tag")?.toLowerCase().replace(/^#/, "");
    const author = searchParams.get("author")?.toLowerCase();
    const replyTo = searchParams.get("replyTo");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const whereClause: any = {};
    if (author) {
      whereClause.authorPubkey = author;
    }
    if (replyTo !== null && replyTo !== undefined) {
      whereClause.replyToId = replyTo;
    }

    const { posts } = await adminDb.query({
      posts: {
        $: {
          where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
          order: { createdAt: "desc" },
          limit,
        },
        profile: {},
        replies: {},
      },
    });

    let results = posts || [];

    // Filter by tag if specified
    if (tag) {
      results = results.filter((p: any) => {
        if (!p.tags) return false;
        try {
          const parsed = JSON.parse(p.tags);
          return Array.isArray(parsed) && parsed.includes(tag);
        } catch {
          return false;
        }
      });
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      posts: results.map((p: any) => ({
        id: p.id,
        content: p.content,
        authorPubkey: p.authorPubkey || null,
        signed: Boolean(p.signed),
        signature: p.signature || null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt || null,
        replyToId: p.replyToId || null,
        rootId: p.rootId || p.id,
        tags: p.tags ? JSON.parse(p.tags) : [],
        profile: p.profile
          ? {
              name: p.profile.name,
              bio: p.profile.bio || null,
              avatar: p.profile.avatar || null,
            }
          : null,
        repliesCount: p.replies?.length || 0,
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

    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (error: any) {
    const isClientError =
      error.message?.includes("signature") ||
      error.message?.includes("Invalid") ||
      error.message?.includes("cannot be empty");
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create post" },
      { status: isClientError ? 400 : 500 }
    );
  }
}
