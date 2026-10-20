import { NextRequest, NextResponse } from "next/server";
import { sendTestEvent } from "@/lib/webhooks";
import { authenticateWebhookRequest } from "@/lib/webhookAuth";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/webhooks/:id/test — signed; sends a synchronous test delivery. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limit = rateLimit(`webhooks:test:${getClientIp(req)}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const auth = authenticateWebhookRequest(req, body, "test", id);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const result = await sendTestEvent(id, auth.pubkey);

    return NextResponse.json(
      { success: result.ok, result },
      { status: result.ok ? 200 : 502 }
    );
  } catch (error: any) {
    const message = error.message || "Failed to send test event";
    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes("not found") ? 404 : 500 }
    );
  }
}
