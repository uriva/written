import { NextResponse } from "next/server";
import { adminDb } from "@/lib/adminDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { tags } = await adminDb.query({
      tags: {
        $: {
          order: { postCount: "desc" },
          limit: 100,
        },
      },
    });

    return NextResponse.json({
      success: true,
      tags: (tags || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        postCount: t.postCount || 1,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
