import { NextResponse } from "next/server";
import { addViewerOffer, isValidSignalDescription } from "@/lib/cosolve-share-store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  if (!shareId) {
    return NextResponse.json({ error: "Missing shareId" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!isValidSignalDescription(body?.offer)) {
    return NextResponse.json({ error: "Invalid offer" }, { status: 400 });
  }

  const viewerId = addViewerOffer(shareId, body.offer);
  if (!viewerId) {
    return NextResponse.json({ error: "Share session not found" }, { status: 404 });
  }

  return NextResponse.json({ viewerId });
}
