import { NextResponse } from "next/server";
import { pingDatabase } from "@/lib/repo";
import { getOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/health — liveness + database reachability. */
export async function GET(req: Request) {
  const startedAt = Date.now();
  let database: "ok" | "error" = "ok";
  let databaseError: string | null = null;

  try {
    await pingDatabase();
  } catch (error: any) {
    database = "error";
    databaseError = error?.message || "query failed";
  }

  return NextResponse.json(
    {
      ok: database === "ok",
      service: "written",
      version: "1.2.0",
      storage: "postgres",
      site: getOrigin(req),
      database,
      databaseError,
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    },
    { status: database === "ok" ? 200 : 503 }
  );
}
