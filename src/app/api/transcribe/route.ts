import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ ok: false, error: "No audio provided." }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const file = await toFile(audio, audio.name || "audio.webm");

    const transcription = await client.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
      temperature: 0.2,
    });

    return NextResponse.json({ ok: true, text: transcription.text || "" });
  } catch (err: any) {
    console.error("Transcription error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to transcribe audio." },
      { status: 500 }
    );
  }
}

