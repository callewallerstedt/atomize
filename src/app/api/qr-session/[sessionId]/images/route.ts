import { NextRequest, NextResponse } from "next/server";
import { getSession, deleteSession, getAllSessions } from "@/lib/qr-session-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    const session = getSession(sessionId);

    if (!session) {
      console.error(`Session not found: ${sessionId}. Available sessions:`, getAllSessions().map(s => s.id));
      return NextResponse.json(
        { error: "Session not found. Please generate a new QR code." },
        { status: 404 }
      );
    }

    const now = Date.now();
    if (session.expiresAt < now) {
      deleteSession(sessionId);
      const expiredMinutes = Math.round((now - session.expiresAt) / 1000 / 60);
      console.error(`Session expired: ${sessionId}. Expired ${expiredMinutes} minutes ago.`);
      return NextResponse.json(
        { error: `Session expired ${expiredMinutes} minute${expiredMinutes !== 1 ? 's' : ''} ago. Please generate a new QR code.` },
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

