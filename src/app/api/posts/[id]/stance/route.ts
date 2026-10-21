import { NextRequest, NextResponse } from "next/server";
import { stancePostServer } from "@/lib/repo";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(`posts:stance:${getClientIp(req)}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Rate limit exceeded. Please wait before updating stance again.",
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

    const voterPubkey = body.voterPubkey || body.pubkey || headerPubkey;
    const signature = body.signature || headerSignature;
    const stance = body.stance;
    const updatedAt = body.updatedAt ? Number(body.updatedAt) : Date.now();

    if (stance !== "support" && stance !== "object" && stance !== "none") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Field 'stance' must be 'support' (publicly express support), 'object' (publicly express objection), or 'none' (clear)",
        },
        { status: 400 }
      );
    }

    if (!voterPubkey || !signature) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Public support/objection requires an Ed25519 public key and signature over WRITTEN_STANCE:{postId}:{stance}:{updatedAt}",
        },
        { status: 401 }
      );
    }

    const result = await stancePostServer({
      postId: id,
      voterPubkey,
      stance,
      signature,
      updatedAt,
    });

    return NextResponse.json({ success: true, stance: result });
  } catch (error: any) {
    const msg = error.message || "Failed to record public stance";
    const status =
      msg.includes("not found") ? 404 :
      msg.includes("signature") ? 401 :
      msg.includes("Invalid") || msg.includes("must be") ? 400 : 500;

    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
