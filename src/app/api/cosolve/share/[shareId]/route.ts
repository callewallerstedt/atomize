import { NextResponse } from "next/server";
import { deleteShareSession, getShareSession } from "@/lib/cosolve-share-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  if (!shareId) {
    return NextResponse.json({ error: "Missing shareId" }, { status: 400 });
  }
  const session = getShareSession(shareId);
  if (!session) {
    return NextResponse.json({ active: false }, { status: 404 });
  }
  return NextResponse.json({ active: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  if (!shareId) {
    return NextResponse.json({ error: "Missing shareId" }, { status: 400 });
  }
  deleteShareSession(shareId);
  return NextResponse.json({ ok: true });
}
