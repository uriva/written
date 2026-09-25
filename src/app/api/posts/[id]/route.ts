import { NextRequest, NextResponse } from "next/server";
import { adminDb, editPostServer } from "@/lib/adminDb";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { posts } = await adminDb.query({
      posts: {
        $: { where: { id } },
        profile: {},
        replies: {
          $: { order: { createdAt: "asc" } },
          profile: {},
        },
        parent: {
          profile: {},
        },
      },
    });

    const post = posts?.[0];
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      post: {
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
        editHistory: post.editHistory ? JSON.parse(post.editHistory) : [],
        profile: post.profile
          ? {
              name: post.profile.name,
              bio: post.profile.bio || null,
              avatar: post.profile.avatar || null,
            }
          : null,
        parent: post.parent
          ? {
              id: post.parent.id,
              content: post.parent.content,
              authorPubkey: post.parent.authorPubkey || null,
              signed: Boolean(post.parent.signed),
              createdAt: post.parent.createdAt,
              profile: post.parent.profile
                ? {
                    name: post.parent.profile.name,
                    avatar: post.parent.profile.avatar || null,
                  }
                : null,
            }
          : null,
        replies: (post.replies || []).map((r: any) => ({
          id: r.id,
          content: r.content,
          authorPubkey: r.authorPubkey || null,
          signed: Boolean(r.signed),
          signature: r.signature || null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt || null,
          tags: r.tags ? JSON.parse(r.tags) : [],
          profile: r.profile
            ? {
                name: r.profile.name,
                avatar: r.profile.avatar || null,
              }
            : null,
        })),
      },
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
