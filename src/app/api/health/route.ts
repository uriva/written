import { NextResponse } from "next/server";
import { APP_ID, adminDb } from "@/lib/adminDb";
import { getOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/health — liveness + database reachability. */
export async function GET(req: Request) {
  const startedAt = Date.now();
  let database: "ok" | "error" = "ok";
  let databaseError: string | null = null;

  try {
    await adminDb.query({ tags: { $: { limit: 1 } } });
  } catch (error: any) {
    database = "error";
    databaseError = error?.message || "query failed";
  }

  return NextResponse.json(
    {
      ok: database === "ok",
      service: "written",
      version: "1.0.0",
      appId: APP_ID,
      site: getOrigin(req),
      database,
      databaseError,
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    },
    { status: database === "ok" ? 200 : 503 }
  );
}
