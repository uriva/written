import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/adminDb";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  try {
    const { pubkey } = await params;
    const cleanPubkey = pubkey.toLowerCase().trim();

    const { profiles, posts } = await adminDb.query({
      profiles: {
        $: { where: { pubkey: cleanPubkey } },
      },
      posts: {
        $: {
          where: { authorPubkey: cleanPubkey },
          order: { createdAt: "desc" },
          limit: 50,
        },
      },
    });

    const profile = profiles?.[0];

    return NextResponse.json({
      success: true,
      pubkey: cleanPubkey,
      profile: profile
        ? {
            name: profile.name,
            bio: profile.bio || null,
            avatar: profile.avatar || null,
            updatedAt: profile.updatedAt,
          }
        : null,
      postCount: posts?.length || 0,
      recentPosts: (posts || []).map((p: any) => ({
        id: p.id,
        content: p.content,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt || null,
        signed: Boolean(p.signed),
        tags: p.tags ? JSON.parse(p.tags) : [],
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
