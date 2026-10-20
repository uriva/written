import { NextRequest, NextResponse } from "next/server";
import { renderLlmsTxt } from "@/lib/llms";
import { getOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return new NextResponse(renderLlmsTxt(getOrigin(req)), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
