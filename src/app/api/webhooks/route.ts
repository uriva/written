import { NextRequest, NextResponse } from "next/server";
import {
  createWebhook,
  listWebhooks,
  serializeWebhook,
} from "@/lib/webhooks";
import { authenticateWebhookRequest, parseFiltersField } from "@/lib/webhookAuth";
import { getClientIp, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/webhooks?pubkey=... (signed)
 * List the webhooks owned by a key.
 *
 * POST /api/webhooks (signed)
 * Register a webhook filtered by keywords, hashtags, authors or thread.
 */
export async function GET(req: NextRequest) {
  const limit = rateLimit(`webhooks:list:${getClientIp(req)}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const pubkey = (searchParams.get("pubkey") || req.headers.get("x-written-pubkey") || "")
      .trim()
      .toLowerCase();

    const auth = authenticateWebhookRequest(req, null, "list", pubkey);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const webhooks = await listWebhooks(auth.pubkey);

    return NextResponse.json({
      success: true,
      count: webhooks.length,
      webhooks: webhooks.map((webhook) => serializeWebhook(webhook, true)),
    });
  } catch (error: any) {
    console.error("[webhooks] list failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list webhooks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(`webhooks:create:${getClientIp(req)}`, 10, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many webhook registrations. Try again later.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "A JSON body is required" },
        { status: 400 }
      );
    }

    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        { success: false, error: "Field 'url' is required" },
        { status: 400 }
      );
    }

    const auth = authenticateWebhookRequest(req, body, "create", url);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const filters = parseFiltersField(body.filters);

    const webhook = await createWebhook({
      ownerPubkey: auth.pubkey,
      url,
      filters,
      description:
        typeof body.description === "string" ? body.description.slice(0, 200) : null,
    });

    return NextResponse.json(
      {
        success: true,
        webhook: serializeWebhook(webhook, true),
        secret: webhook.secret,
        note:
          "Save the secret. Verify deliveries with X-Written-Signature: t=<unix>,v1=<hex HMAC-SHA256 of `${t}.${body}`>.",
      },
      { status: 201 }
    );
  } catch (error: any) {
    const message = error.message || "Failed to create webhook";
    const status = message.includes("not set") ? 500 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
