import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  try {
    const { pubkey } = await params;
    const cleanPubkey = pubkey.toLowerCase().trim();
    const {
      profile,
      postCount,
      recentPosts,
      mentionCount,
      mentionedPosts,
    } = await getProfile(cleanPubkey);

    return NextResponse.json({
      success: true,
      pubkey: cleanPubkey,
      profile: profile
        ? {
            name: profile.name,
            bio: profile.bio,
            avatar: profile.avatar,
            updatedAt: profile.updatedAt,
          }
        : null,
      postCount,
      mentionCount,
      recentPosts: recentPosts.map((post) => ({
        id: post.id,
        content: post.content,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        signed: post.signed,
        tags: post.tags,
        mentions: post.mentions,
      })),
      mentionedPosts: mentionedPosts.map((post) => ({
        id: post.id,
        content: post.content,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        signed: post.signed,
        tags: post.tags,
        mentions: post.mentions,
        authorPubkey: post.authorPubkey,
        profile: post.profile,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
