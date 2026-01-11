import { NextResponse } from "next/server";
import { getViewerAnswer } from "@/lib/cosolve-share-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shareId: string; viewerId: string }> }
) {
  const { shareId, viewerId } = await params;
  if (!shareId || !viewerId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const answer = getViewerAnswer(shareId, viewerId);
  if (answer === undefined) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ answer });
}
