import { NextRequest, NextResponse } from "next/server";
import { verifyPayload } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { signature, message, pubkey } = body;

    if (!signature || !message || !pubkey) {
      return NextResponse.json(
        {
          success: false,
          error: "Fields 'signature', 'message', and 'pubkey' are required",
        },
        { status: 400 }
      );
    }

    const valid = verifyPayload(signature, message, pubkey);

    return NextResponse.json({
      success: true,
      valid,
      pubkey,
      message,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Verification failed" },
      { status: 400 }
    );
  }
}
