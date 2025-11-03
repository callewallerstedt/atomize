import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    const form = await req.formData();
    const files = form.getAll("files") as unknown as File[];
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ids: string[] = [];
    for (const f of files) {
      try {
        const up = await client.files.create({ file: f as any, purpose: "assistants" });
        ids.push(up.id);
      } catch {}
    }
    return NextResponse.json({ ok: true, fileIds: ids });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}




