import { NextResponse } from "next/server";
import { isValidSignalDescription, setViewerAnswer } from "@/lib/cosolve-share-store";

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
  if (!body?.viewerId || typeof body.viewerId !== "string") {
    return NextResponse.json({ error: "Missing viewerId" }, { status: 400 });
  }
  if (!isValidSignalDescription(body?.answer)) {
    return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
  }

  const updated = setViewerAnswer(shareId, body.viewerId, body.answer);
  if (!updated) {
    return NextResponse.json({ error: "Viewer not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
