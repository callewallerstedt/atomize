import { NextResponse } from "next/server";
import { getPendingViewerOffers } from "@/lib/cosolve-share-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  if (!shareId) {
    return NextResponse.json({ error: "Missing shareId" }, { status: 400 });
  }

  const offers = getPendingViewerOffers(shareId);
  if (!offers) {
    return NextResponse.json({ error: "Share session not found" }, { status: 404 });
  }

  return NextResponse.json({ offers });
}
