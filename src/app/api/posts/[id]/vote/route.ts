import { NextRequest, NextResponse } from "next/server";
import { votePostServer } from "@/lib/repo";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(`posts:vote:${getClientIp(req)}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Rate limit exceeded. Please wait before voting again.",
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
    const value = Number(body.value);
    const updatedAt = body.updatedAt ? Number(body.updatedAt) : Date.now();

    if (value !== 1 && value !== -1 && value !== 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Field 'value' must be 1 (more of this), -1 (less of this), or 0 (clear vote)",
        },
        { status: 400 }
      );
    }

    if (!voterPubkey || !signature) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Voting requires an Ed25519 public key and signature over WRITTEN_VOTE:{postId}:{value}:{updatedAt}",
        },
        { status: 401 }
      );
    }

    const vote = await votePostServer({
      postId: id,
      voterPubkey,
      value: value as -1 | 0 | 1,
      signature,
      updatedAt,
    });

    return NextResponse.json({ success: true, vote });
  } catch (error: any) {
    const msg = error.message || "Failed to record vote";
    const status =
      msg.includes("not found") ? 404 :
      msg.includes("signature") ? 401 :
      msg.includes("Invalid") || msg.includes("must be") ? 400 : 500;

    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
