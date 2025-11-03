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
    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "Subject");
    const fileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds : [];
    const contextText = String(body.contextText || "").slice(0, 200_000);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "Extract ONLY main topics from the course material.",
      "Return STRICT JSON with this exact shape:",
      "{ subject: string; topics: { name: string; summary: string; coverage: number }[] }",
      "Rules:",
      "- Use 6-12 concise main topics (2-5 words).",
      "- summary: 1-2 sentences based on the material.",
      "- coverage: integer 0-100 estimating how much of the total material this topic covers; topics should roughly sum to ~100 but do not exceed.",
      "- No subtopics, no markdown, no code fences, JSON only.",
      "- Ignore the subject/course name string for determining topics; use only the provided material content.",
    ].join("\n");

    const inputContent: any[] = [
      { type: "input_text", text: `Subject (label only, do not infer from it): ${subject}\nPlease extract ONLY main topics from the attached files. Return JSON only.` },
      ...fileIds.map((id: string) => ({ type: "input_file", file_id: id })),
    ];
    if (contextText) inputContent.push({ type: "input_text", text: `Additional context (user-provided):\n${contextText}` });

    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      instructions: system,
      input: [ { role: "user", content: inputContent as any } ],
    });
    const out = (resp as any).output_text || "{}";
    let data: any = {};
    try {
      data = JSON.parse(out);
    } catch {
      const s = out.indexOf("{"); const e = out.lastIndexOf("}");
      if (s >= 0 && e > s) data = JSON.parse(out.slice(s, e + 1));
    }
    if (!data || !data.subject) data = { subject, topics: Array.isArray(data?.topics) ? data.topics : [] };
    return NextResponse.json({ ok: true, data, combinedText: "" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}




