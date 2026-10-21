import { NextRequest, NextResponse } from "next/server";
import { editPostServer, getPostThread } from "@/lib/repo";
import { emitEvent } from "@/lib/webhooks";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const viewer =
      searchParams.get("viewer")?.toLowerCase() ||
      req.headers.get("x-written-pubkey")?.toLowerCase() ||
      null;
    const thread = await getPostThread(id, viewer);

    if (!thread) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      post: {
        ...thread.post,
        parent: thread.parent,
      },
      parent: thread.parent,
      grandParent: thread.grandParent,
      replies: thread.post.replies ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch post" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(`posts:edit:${getClientIp(req)}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Rate limit exceeded. Please wait before editing again.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const headerPubkey = req.headers.get("x-written-pubkey");
    const headerSignature = req.headers.get("x-written-signature");

    const newContent = body.content || body.newContent;
    const authorPubkey = body.authorPubkey || headerPubkey;
    const signature = body.signature || headerSignature;
    const updatedAt = body.updatedAt || Date.now();

    if (!newContent || typeof newContent !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'content' is required and must be a string" },
        { status: 400 }
      );
    }

    if (!authorPubkey || !signature) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Editing requires cryptographic signature and author public key ('authorPubkey' & 'signature' or headers 'X-Written-Pubkey' & 'X-Written-Signature')",
        },
        { status: 401 }
      );
    }

    const updated = await editPostServer({
      postId: id,
      newContent,
      authorPubkey,
      signature,
      updatedAt,
    });

    await emitEvent(
      {
        type: "post.updated",
        data: {
          post: {
            id: updated.id,
            content: updated.content,
            authorPubkey: updated.authorPubkey,
            signed: true,
            signature: updated.signature,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            replyToId: updated.replyToId,
            rootId: updated.rootId,
            tags: updated.tags,
            mentions: updated.mentions,
            profile: updated.profile,
          },
        },
        content: updated.content,
        tags: updated.tags,
        mentions: updated.mentions,
        authorPubkey: updated.authorPubkey || undefined,
        replyToId: updated.replyToId || undefined,
        rootId: updated.rootId || undefined,
      },
      { origin: getOrigin(req) }
    );

    return NextResponse.json({ success: true, post: updated });
  } catch (error: any) {
    const msg = error.message || "Failed to edit post";
    const status =
      msg.includes("not found") ? 404 :
      msg.includes("signature") || msg.includes("mismatch") ? 401 :
      msg.includes("immutable") || msg.includes("Unsigned") ? 403 : 400;

    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
