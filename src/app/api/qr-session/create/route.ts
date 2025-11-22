import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSession } from "@/lib/qr-session-store";

export async function POST(req: NextRequest) {
  try {
    const sessionId = randomUUID();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    const session = createSession(sessionId, expiresAt);
    console.log("Created QR session:", sessionId, "expires at:", new Date(expiresAt).toISOString());

    // Get the origin from the request
    const origin = req.headers.get("origin") || req.headers.get("host") || "localhost:25565";
    const protocol = req.headers.get("x-forwarded-proto") || (origin.includes("localhost") ? "http" : "https");
    const baseUrl = `${protocol}://${origin.replace(/^https?:\/\//, "")}`;
    
    const qrUrl = `${baseUrl}/qr-camera/${sessionId}`;

    return NextResponse.json({
      sessionId,
      qrUrl,
      expiresAt,
    });
  } catch (error: any) {
    console.error("Error creating QR session:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create session" },
      { status: 500 }
    );
  }
}

