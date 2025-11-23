import { NextRequest, NextResponse } from "next/server";
import { getSession, addImagesToSession, deleteSession, getAllSessions } from "@/lib/qr-session-store";

export async function POST(
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
    
    console.log("Upload request for session:", sessionId);
    const session = getSession(sessionId);
    
    console.log("Session found:", !!session);
    if (session) {
      console.log("Session expires at:", new Date(session.expiresAt).toISOString());
      console.log("Current time:", new Date().toISOString());
    }

    if (!session) {
      const allSessions = getAllSessions();
      console.error("Session not found in store. Available sessions:", allSessions.map(s => s.id));
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

    const formData = await req.formData();
    const files = formData.getAll("images") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No images provided" },
        { status: 400 }
      );
    }

    // Process each image
    const uploadedImages: Array<{ id: string; data: string; timestamp: number }> = [];

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        continue;
      }

      // Convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.type};base64,${base64}`;

      const imageId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      uploadedImages.push({
        id: imageId,
        data: dataUrl,
        timestamp: Date.now(),
      });
    }

    // Add to session
    addImagesToSession(sessionId, uploadedImages);
    const updatedSession = getSession(sessionId);

    return NextResponse.json({
      success: true,
      uploaded: uploadedImages.length,
      totalImages: updatedSession?.images.length || 0,
    });
  } catch (error: any) {
    console.error("Error uploading images:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to upload images" },
      { status: 500 }
    );
  }
}

