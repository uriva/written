import { NextRequest, NextResponse } from "next/server";
import {
  deleteWebhook,
  getWebhookForOwner,
  listDeliveries,
  serializeWebhook,
  updateWebhook,
} from "@/lib/webhooks";
import { authenticateWebhookRequest, parseFiltersField } from "@/lib/webhookAuth";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function limited(req: NextRequest, scope: string, max: number, windowMs: number) {
  const result = rateLimit(`webhooks:${scope}:${getClientIp(req)}`, max, windowMs);
  if (result.allowed) return null;
  return NextResponse.json(
    { success: false, error: "Rate limit exceeded", retryAfterSeconds: result.retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
  );
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const throttled = limited(req, "read", 60, 60_000);
  if (throttled) return throttled;

  try {
    const { id } = await params;
    const auth = authenticateWebhookRequest(req, null, "get", id);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const webhook = await getWebhookForOwner(id, auth.pubkey);
    if (!webhook) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    const deliveries = await listDeliveries(id, auth.pubkey, 20);

    return NextResponse.json({
      success: true,
      webhook: serializeWebhook(webhook, true),
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
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load webhook" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const throttled = limited(req, "update", 30, 60_000);
  if (throttled) return throttled;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "A JSON body is required" },
        { status: 400 }
      );
    }

    const auth = authenticateWebhookRequest(req, body, "update", id);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (
      body.url === undefined &&
      body.filters === undefined &&
      body.description === undefined &&
      body.active === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Provide at least one of: url, filters, description, active",
        },
        { status: 400 }
      );
    }

    const webhook = await updateWebhook(id, auth.pubkey, {
      url: typeof body.url === "string" ? body.url : undefined,
      filters: body.filters === undefined ? undefined : parseFiltersField(body.filters),
      description:
        body.description === undefined
          ? undefined
          : typeof body.description === "string"
            ? body.description
            : null,
      active: typeof body.active === "boolean" ? body.active : undefined,
    });

    return NextResponse.json({ success: true, webhook: serializeWebhook(webhook, true) });
  } catch (error: any) {
    const message = error.message || "Failed to update webhook";
    const status = message.includes("not found")
      ? 404
      : message.includes("not set")
        ? 500
        : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const throttled = limited(req, "delete", 30, 60_000);
  if (throttled) return throttled;

  try {
    const { id } = await params;
    const auth = authenticateWebhookRequest(req, null, "delete", id);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    await deleteWebhook(id, auth.pubkey);
    return NextResponse.json({ success: true, deleted: id });
  } catch (error: any) {
    const message = error.message || "Failed to delete webhook";
    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes("not found") ? 404 : 500 }
    );
  }
}
