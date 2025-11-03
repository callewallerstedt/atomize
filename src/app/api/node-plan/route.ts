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
    const combinedText = String(body.combinedText || "");
    const course_context = String(body.course_context || "");
    const courseTopics: string[] = Array.isArray(body.courseTopics) ? body.courseTopics.slice(0, 200) : [];
    const languageName = String(body.languageName || "");
    if (!topic) return NextResponse.json({ ok: false, error: "Missing topic" }, { status: 400 });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = [
      "You prepare a detailed plan for teaching ONE topic using the course context and materials.",
      "Return STRICT JSON (no markdown, no code fences) with:",
      "{ overview_child: string; lessonsMeta: { type: 'Intro' | 'Concept' | 'Integration' | 'Application' | 'Mastery'; title: string }[] }",
      "Rules:",
      `- Use the detailed course context to identify SPECIFIC concepts, methods, and skills that should be taught in this topic.`,
      `- overview_child is brief, child-level, KaTeX-ready Markdown ($...$, $$...$$ allowed). ${languageName ? `Write in ${languageName}.` : ''}`,
      "- lessonsMeta order and types: Intro (1), Concept (2–4), Integration (≥1), Application (≥1), Mastery (1).",
      "- Design lesson titles that reflect the specific concepts and methods from the course context",
      "- Ensure the lesson progression teaches the key learning objectives identified in the course materials",
      "- titles should be concise (2–6 words) but descriptive of the specific content to teach.",
    ].join("\n");

    const user = [
      `Subject: ${subject || "(unspecified)"}`,
      `Topic: ${topic}`,
      course_context ? `Course summary: ${course_context}` : "",
      courseTopics.length ? `Course topics: ${courseTopics.join(", ")}` : "",
      "Relevant material (truncated):",
      combinedText || "",
    ].filter(Boolean).join("\n\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "TopicPlan",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              overview_child: { type: "string" },
              lessonsMeta: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: { type: "string", enum: ["Intro", "Concept", "Integration", "Application", "Mastery"] },
                    title: { type: "string" },
                  },
                  required: ["type", "title"],
                },
              },
            },
            required: ["overview_child", "lessonsMeta"],
          },
          strict: true,
        },
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 900,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let data: any = {};
    try {
      data = JSON.parse(content);
    } catch {
      data = {};
    }
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


