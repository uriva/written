import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchDueDeliveries } from "@/lib/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = req.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const custom = (req.headers.get("x-cron-secret") || "").trim();
  const provided = bearer || custom;

  return Boolean(provided) && safeEqual(provided, secret);
}

/**
 * Retry pending webhook deliveries.
 *
 * Call from Vercel Cron, GitHub Actions, or any scheduler:
 *   curl -X POST https://<host>/api/cron/webhooks -H "Authorization: Bearer $CRON_SECRET"
 */
async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "CRON_SECRET is not configured. Set it in the environment to enable the delivery retry endpoint.",
      },
      { status: 503 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requested = Number(new URL(req.url).searchParams.get("limit") || "25");
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 25, 1), 100);
    const result = await dispatchDueDeliveries(limit);

    return NextResponse.json({ success: true, ...result, ranAt: Date.now() });
  } catch (error: any) {
    console.error("[webhooks] cron failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Delivery sweep failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
