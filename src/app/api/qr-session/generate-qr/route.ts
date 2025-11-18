import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    
    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Use a simple QR code API service instead of the qrcode package
    // This avoids module resolution issues with Turbopack
    const encodedUrl = encodeURIComponent(url);
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodedUrl}`;
    
    // Fetch the QR code image and convert to data URL
    const qrResponse = await fetch(qrApiUrl);
    if (!qrResponse.ok) {
      throw new Error("Failed to generate QR code from API");
    }
    
    const imageBuffer = await qrResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const qrDataUrl = `data:image/png;base64,${base64}`;

    return NextResponse.json({
      qrDataUrl,
    });
  } catch (error: any) {
    console.error("Error generating QR code:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate QR code" },
      { status: 500 }
    );
  }
}

