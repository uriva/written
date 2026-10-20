import { NextResponse } from "next/server";
import { listTags } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const tags = await listTags();

    return NextResponse.json({
      success: true,
      tags,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
