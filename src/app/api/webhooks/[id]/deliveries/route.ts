import { NextRequest, NextResponse } from "next/server";
import { listDeliveries } from "@/lib/webhooks";
import { authenticateWebhookRequest } from "@/lib/webhookAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/webhooks/:id/deliveries?limit=25 — signed; recent delivery attempts. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = authenticateWebhookRequest(req, null, "deliveries", id);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const requested = Number(new URL(req.url).searchParams.get("limit") || "25");
    const limit = Number.isFinite(requested) ? requested : 25;
    const deliveries = await listDeliveries(id, auth.pubkey, limit);

    return NextResponse.json({
      success: true,
      count: deliveries.length,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        event: delivery.event,
        status: delivery.status,
        attempts: delivery.attempts,
        responseStatus: delivery.responseStatus ?? null,
        error: delivery.error || null,
        createdAt: delivery.createdAt,
        nextAttemptAt: delivery.nextAttemptAt,
        deliveredAt: delivery.deliveredAt ?? null,
        payload: delivery.payload,
      })),
    });
  } catch (error: any) {
    const message = error.message || "Failed to list deliveries";
    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes("not found") ? 404 : 500 }
    );
  }
}
