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
    const subject = String(body.subject || "");
    const topic = String(body.topic || "");
    const word = String(body.word || "");
    const localContext = String(body.localContext || "");
    const courseTopics: string[] = Array.isArray(body.courseTopics) ? body.courseTopics.slice(0, 100) : [];
    const languageName = String(body.languageName || "");

    if (!word) return NextResponse.json({ ok: false, error: "Missing word" }, { status: 400 });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "You provide a short, friendly explanation of a term or phrase.",
      "Constraints:",
      "- 2-4 sentences max.",
      `- Use simple language (child-level clarity). ${languageName ? `Write in ${languageName}.` : ''}`,
      "- If math is relevant, use KaTeX-compatible LaTeX ($...$, $$...$$).",
      "- No code fences, no lists unless truly necessary.",
    ].join("\n");

    const user = [
      subject ? `Subject: ${subject}` : "",
      topic ? `Topic: ${topic}` : "",
      courseTopics.length ? `Course topics: ${courseTopics.join(", ")}` : "",
      `Explain: ${word}`,
      localContext ? `Nearby context: ${localContext.slice(0, 600)}` : "",
    ].filter(Boolean).join("\n\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      max_tokens: 220,
    });

    const content = completion.choices[0]?.message?.content || "";
    return NextResponse.json({ ok: true, content });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


