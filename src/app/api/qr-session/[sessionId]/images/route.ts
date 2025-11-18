import { NextRequest, NextResponse } from "next/server";
import { getSession, deleteSession } from "@/lib/qr-session-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.expiresAt < Date.now()) {
      deleteSession(sessionId);
      return NextResponse.json(
        { error: "Session expired" },
        { status: 410 }
      );
    }

    return NextResponse.json({
      images: session.images,
      totalImages: session.images.length,
    });
  } catch (error: any) {
    console.error("Error fetching images:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch images" },
      { status: 500 }
    );
  }
}

