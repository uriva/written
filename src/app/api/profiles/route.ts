import { NextRequest, NextResponse } from "next/server";
import { upsertProfileServer } from "@/lib/adminDb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

    return NextResponse.json({ success: true, profile });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update profile" },
      { status: 400 }
    );
  }
}
