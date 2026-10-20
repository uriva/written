import { NextRequest, NextResponse } from "next/server";
import { upsertProfileServer } from "@/lib/repo";
import { emitEvent } from "@/lib/webhooks";
import { getClientIp, rateLimit } from "@/lib/rateLimit";
import { getOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limit = rateLimit(`profiles:update:${getClientIp(req)}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Rate limit exceeded. Please wait before updating your profile again.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const headerPubkey = req.headers.get("x-written-pubkey");
    const headerSignature = req.headers.get("x-written-signature");

    const pubkey = body.pubkey || headerPubkey;
    const name = body.name;
    const bio = body.bio || null;
    const avatar = body.avatar || null;
    const signature = body.signature || headerSignature || null;
    const updatedAt = body.updatedAt || Date.now();

    if (!pubkey || !name) {
      return NextResponse.json(
        { success: false, error: "Fields 'pubkey' and 'name' are required" },
        { status: 400 }
      );
    }

    const profile = await upsertProfileServer({
      pubkey,
      name,
      bio,
      avatar,
      signature,
      updatedAt,
    });

    await emitEvent(
      {
        type: "profile.updated",
        data: {
          profile: {
            pubkey: profile.pubkey,
            name: profile.name,
            bio: profile.bio || null,
            avatar: profile.avatar || null,
            updatedAt: profile.updatedAt,
          },
        },
        content: `${profile.name} ${profile.bio || ""}`.trim(),
        authorPubkey: profile.pubkey,
      },
      { origin: getOrigin(req) }
    );

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update profile" },
      { status: 400 }
    );
  }
}
