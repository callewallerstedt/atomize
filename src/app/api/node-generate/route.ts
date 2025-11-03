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
    const nodeName = String(body.nodeName || "");
    const combinedText = String(body.combinedText || "");
    const courseTopics: string[] = Array.isArray(body.courseTopics) ? body.courseTopics.slice(0, 200) : [];
    if (!nodeName) return NextResponse.json({ ok: false, error: "Missing nodeName" }, { status: 400 });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = [
      "You create a structured sequence of lessons for ONE topic.",
      `Return STRICT JSON (no markdown, no code fences) with this shape:
{
  topic: string,
  overview_child: string,
  symbols: { symbol: string, meaning: string, units?: string }[],
  lessons: { type: 'Intro' | 'Concept' | 'Integration' | 'Application' | 'Mastery', title: string, body: string, quiz: { question: string }[] }[]
}`,
      "Lesson rules:",
      "- Types and order (increasing difficulty):",
      "  1) Intro (1 lesson) — big picture; outline what follows; very short.",
      "  2) Concept (1 per key concept) — each focuses on one idea; start with a brief recap from previous; end with 2-4 short recall questions.",
      "  3) Integration (at least 1) — combine multiple prior concepts; include one small example.",
      "  4) Application (at least 1) — realistic/exam-like problems; short explanation + practical exercises.",
      "  5) Mastery (1 lesson) — mixed review; spaced repetition; short questions + mini explanations.",
      "- Every lesson after the first begins with a brief recap of key points from the previous lesson.",
      "- Bodies are plain Markdown with KaTeX math ($...$, $$...$$) when needed.",
      "- Keep each lesson concise and clear; quizzes are short and integrated at the end as questions.",
      "- Use the provided material to infer key concepts; if unclear, pick 2–4 plausible concepts.",
    ].join("\n");

    const user = [
      `Subject: ${subject || "(unspecified)"}`,
      `Topic: ${nodeName}`,
      courseTopics.length ? `Course topics context: ${courseTopics.join(", ")}` : "",
      "Relevant material (truncated):",
      combinedText || "No material; write a generic note for the topic.",
    ].filter(Boolean).join("\n\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let data: any = {};
    try {
      data = JSON.parse(content);
    } catch {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) data = JSON.parse(content.slice(start, end + 1));
    }
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


