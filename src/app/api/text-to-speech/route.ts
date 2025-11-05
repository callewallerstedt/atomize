import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").trim();

    if (!text) {
      return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 });
    }

    // Clean text: remove markdown, LaTeX, and code blocks for better TTS
    let cleanText = text
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]+`/g, '') // Remove inline code
      .replace(/\$\$[\s\S]*?\$\$/g, '') // Remove block math
      .replace(/\$[^$]+\$/g, '') // Remove inline math
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Convert markdown links to text
      .replace(/[#*_~`]/g, '') // Remove markdown formatting
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();

    if (!cleanText || cleanText.length < 10) {
      return NextResponse.json({ ok: false, error: "Text too short after cleaning" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Use OpenAI TTS API
    const mp3 = await client.audio.speech.create({
      model: "tts-1",
      voice: "nova", // Can be: alloy, echo, fable, onyx, nova, shimmer
      input: cleanText.slice(0, 4096), // TTS has a limit
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("TTS error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "TTS failed" }, { status: 500 });
  }
}

