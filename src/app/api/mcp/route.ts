import { NextRequest, NextResponse } from "next/server";
import { handleMcpRequest } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, accept, mcp-protocol-version, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function jsonResponse(body: unknown, status: number, extra?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

/**
 * MCP Streamable HTTP endpoint.
 *
 * Stateless: every JSON-RPC request is self-contained and answered with JSON
 * (no SSE stream or session id required). Tool discovery uses `tools/list`.
 */
export async function POST(req: NextRequest) {
  const result = await handleMcpRequest(req);

  if (result.body === undefined) {
    return new Response(null, {
      status: result.status,
      headers: {
        "Cache-Control": "no-store",
        ...CORS_HEADERS,
        ...result.headers,
      },
    });
  }

  return jsonResponse(result.body, result.status, result.headers);
}

export async function GET() {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "This MCP endpoint uses Streamable HTTP POST requests. Open /llms.txt for protocol documentation.",
      },
    },
    405,
    { Allow: "POST, OPTIONS" }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
