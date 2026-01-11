import { NextResponse } from "next/server";
import { createShareSession } from "@/lib/cosolve-share-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const shareId = createShareSession();
    const url = new URL(req.url);
    const shareUrl = `${url.origin}/cosolve/share/${shareId}`;
    return NextResponse.json({ shareId, shareUrl });
  } catch (error) {
    console.error("CoSolve share create error:", error);
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}
